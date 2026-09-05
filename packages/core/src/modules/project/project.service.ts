// Moved from packages/db/src/services/project.service.ts (M6-002, module
// map: project owns "R,H,S,C"). packages/db keeps a re-export shim: its own
// access.service.ts and notification.service.ts still reach `getProjectById`
// / `getProjectByIdCached` through the same relative path, and
// apps/api/src/utils/auth.ts + several other core modules' `src/access.ts`
// reach them through @openpanel/db's barrel — same shape as
// packages/db/src/services/organization.service.ts since M6-001.
//
// The /manage REST CRUD bodies (apps/api/src/controllers/manage.controller.ts's
// listProjects/getProject/createProject/updateProject/deleteProject) move
// here too, so V1's controller and core's own project.routes.ts share one
// implementation (DELEGATE PATTERN).
//
// db/ch access is LAZY (`load*` below), not a static top-level import — see
// insight.service.ts's header for the full reasoning (jobs.registry.ts and
// rpc.router.ts pull this module into the eager barrel chain nearly every
// core test file reaches, and constructing @openpanel/db's clients at import
// time would spawn a pino-pretty transport worker thread per test file).
//
// ClickHouse queries here still go through clix/sqlstring, not the `sql`
// tag: ADR-013 converts the analytics read path one query per P7 task, and
// this module's queries haven't been converted yet.

import crypto from 'node:crypto';
import { stripTrailingSlash } from '@openpanel/common';
import { clix } from '@openpanel/db/src/clickhouse/query-builder';
import type {
  Prisma,
  Project,
  ProjectType,
} from '@openpanel/db/src/prisma-client';
import { cacheable } from '@openpanel/redis';
import sqlstring from 'sqlstring';
import { TRPCBadRequestError } from '../../rpc/errors';
import { hashPassword } from '../auth/auth.service';
import { getClientByIdCached } from '../client/client.service';

export type IServiceProject = Project;
export type IServiceProjectWithClients = Prisma.ProjectGetPayload<{
  include: {
    clients: true;
  };
}>;

function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

function loadChClient() {
  return import('@openpanel/db/src/clickhouse/client');
}

function loadIdService() {
  return import('@openpanel/core').then((m) => m.getId);
}

export async function getProjectById(id: string) {
  const db = await loadDb();
  const res = await db.project.findUnique({
    where: {
      id,
    },
  });

  if (!res) {
    return null;
  }

  return res;
}

const DAY_IN_SECONDS = 60 * 60 * 24;
/** L1 LRU (60s) + L2 Redis. clear() invalidates Redis + local LRU; other nodes may serve stale from LRU for up to 60s. */
export const getProjectByIdCached = cacheable(getProjectById, DAY_IN_SECONDS);

export async function getProjectWithClients(id: string) {
  const db = await loadDb();
  const res = await db.project.findUnique({
    where: {
      id,
    },
    include: {
      clients: true,
    },
  });

  if (!res) {
    return null;
  }

  return res;
}

export async function getProjects({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string | null;
}) {
  if (!userId) {
    return [];
  }

  const db = await loadDb();
  const [projects, members, access] = await Promise.all([
    db.project.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        eventsCount: 'desc',
      },
    }),
    db.member.findMany({
      where: {
        userId,
        organizationId,
      },
    }),
    db.projectAccess.findMany({
      where: {
        userId,
        organizationId,
      },
    }),
  ]);

  if (members.length === 0) {
    return [];
  }

  if (access.length > 0) {
    return projects.filter((project) =>
      access.some((a) => a.projectId === project.id)
    );
  }

  return projects;
}

/**
 * Fast approximate count of a project's events (excluding session_start /
 * session_end), read from distinct_event_names_mv instead of the raw events
 * table.
 *
 * Why not count raw events: `name NOT IN (...)` is a negation, so it can't
 * prune with idx_name and scans the project's whole events slice — and this
 * runs from the sessions job on every batch. The MV already accumulates
 * `count() AS event_count` per (project_id, name) insert block, so summing
 * it reads a few thousand pre-aggregated rows instead of billions of raw
 * ones.
 *
 * Why approximate: event_count is a plain UInt64, not an aggregate state,
 * so MV counter rows whose (project_id, name, created_at) sort key collides
 * collapse on merge keeping only one block's count. Live ingestion rarely
 * ties on the ms timestamp; bulk imports with coarse timestamps are where
 * collisions come from. The error is strictly downward (measured 0.0011%
 * low on a 1.46B-event project) — acceptable for this display/onboarding
 * counter.
 */
export const getProjectEventsCount = async (projectId: string) => {
  const { chQuery, TABLE_NAMES } = await loadChClient();
  const res = await chQuery<{ count: number }>(
    `SELECT sum(event_count) as count FROM ${TABLE_NAMES.event_names_mv} WHERE project_id = ${sqlstring.escape(projectId)} AND name NOT IN ('session_start', 'session_end')`
  );
  return res[0]?.count;
};

/**
 * Newest event timestamp per project, for the whole instance in one query.
 * Reads the same pre-aggregated MV as getProjectEventsCount (it stores
 * max(created_at) per (project_id, name) block), so this scans thousands of
 * rows instead of the raw events table. Projects with no events are absent
 * from the map.
 */
export const getLastEventPerProject = async (): Promise<Map<string, Date>> => {
  const { ch, TABLE_NAMES, convertClickhouseDateToJs } = await loadChClient();
  const res = await clix(ch)
    .select<{ project_id: string; last_event_at: string }>([
      'project_id',
      'max(created_at) AS last_event_at',
    ])
    .from(TABLE_NAMES.event_names_mv)
    // Session rows are worker-generated (the reaper can emit session_end after
    // tracking already stopped) — only real tracking activity should count.
    .where('name', 'NOT IN', ['session_start', 'session_end'])
    .groupBy(['project_id'])
    .execute();
  return new Map(
    res.map((row) => [
      row.project_id,
      convertClickhouseDateToJs(row.last_event_at),
    ])
  );
};

/**
 * Resolve and validate a projectId for an API client.
 *
 * - Read clients: returns the fixed projectId from the client (ignores any supplied value).
 * - Root clients: validates that the supplied projectId belongs to the client's organization.
 *
 * Throws if the project is not found or does not belong to the organization.
 * Use this as the single source of truth for projectId resolution across the API and MCP.
 */
export async function resolveClientProjectId({
  clientType,
  clientProjectId,
  organizationId,
  inputProjectId,
}: {
  clientType: 'read' | 'root';
  clientProjectId: string | null;
  organizationId: string;
  inputProjectId: string | undefined;
}): Promise<string> {
  if (clientType !== 'root') {
    if (!clientProjectId) {
      throw new Error('Client is not associated with a project');
    }
    return clientProjectId;
  }

  if (!inputProjectId) {
    throw new Error(
      'projectId is required when using a root (organization-level) client'
    );
  }

  const db = await loadDb();
  const project = await db.project.findFirst({
    where: { id: inputProjectId, organizationId },
    select: { id: true },
  });

  if (!project) {
    throw new Error(
      'Project not found or does not belong to your organization'
    );
  }

  return inputProjectId;
}

export interface ProjectActivationStatus {
  hasFirstEvent: boolean;
  firstEventAt: Date | null;
  projectCreatedAt: Date;
  hasReport: boolean;
  hasTeammate: boolean;
}

/** Powers the activation checklist on the project overview (trpc project.activationStatus). */
export async function getProjectActivationStatus(
  projectId: string
): Promise<ProjectActivationStatus> {
  const db = await loadDb();
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      firstEventAt: true,
      eventsCount: true,
      organizationId: true,
      createdAt: true,
    },
  });

  const [reportCount, memberCount] = await Promise.all([
    db.report.count({ where: { projectId } }),
    db.member.count({ where: { organizationId: project.organizationId } }),
  ]);

  return {
    // firstEventAt only exists for projects created after the column was
    // added; the lifetime counter covers everything older.
    hasFirstEvent: !!project.firstEventAt || project.eventsCount > 0,
    firstEventAt: project.firstEventAt,
    projectCreatedAt: project.createdAt,
    hasReport: reportCount > 0,
    hasTeammate: memberCount > 1,
  };
}

export async function listProjectsCore(input: {
  clientType: 'root' | 'read';
  organizationId: string;
  projectId: string | null;
}) {
  const db = await loadDb();
  if (input.clientType === 'root') {
    const projects = await db.project.findMany({
      where: { organizationId: input.organizationId },
      orderBy: { eventsCount: 'desc' },
      select: {
        id: true,
        name: true,
        organizationId: true,
        eventsCount: true,
        domain: true,
        types: true,
      },
    });
    return { clientType: 'root', projects };
  }

  const project = input.projectId
    ? await db.project.findUnique({
        where: { id: input.projectId },
        select: {
          id: true,
          name: true,
          organizationId: true,
          eventsCount: true,
          domain: true,
          types: true,
        },
      })
    : null;

  return {
    clientType: 'read',
    projects: project ? [project] : [],
  };
}

// --- /manage REST CRUD (apps/api/src/controllers/manage.controller.ts) ---

export interface CreatedProjectClient {
  id: string;
  secret: string;
}

export async function listProjectsForOrganization(organizationId: string) {
  const db = await loadDb();
  return db.project.findMany({
    where: {
      organizationId,
      deleteAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export async function getProjectForOrganization(
  id: string,
  organizationId: string
) {
  const db = await loadDb();
  return db.project.findFirst({
    where: {
      id,
      organizationId,
    },
  });
}

export async function createProjectForOrganization(
  organizationId: string,
  input: {
    name: string;
    domain?: string | null;
    cors: string[];
    crossDomain: boolean;
    types: ProjectType[];
  }
): Promise<{ project: IServiceProject; client: CreatedProjectClient | null }> {
  const db = await loadDb();
  const getId = await loadIdService();

  const secret = `sec_${crypto.randomBytes(10).toString('hex')}`;
  const project = await db.project.create({
    data: {
      id: await getId('project', input.name),
      organizationId,
      name: input.name,
      domain: input.domain ? stripTrailingSlash(input.domain) : null,
      cors: input.cors.map((c) => stripTrailingSlash(c)),
      crossDomain: input.crossDomain ?? false,
      allowUnsafeRevenueTracking: false,
      filters: [],
      types: input.types,
      clients: {
        create: {
          organizationId,
          name: 'First client',
          type: 'write',
          secret: await hashPassword(secret),
        },
      },
    },
    include: {
      clients: {
        select: {
          id: true,
        },
      },
    },
  });

  await Promise.all([
    getProjectByIdCached.clear(project.id),
    ...project.clients.map((client) => getClientByIdCached.clear(client.id)),
  ]);

  return {
    project,
    client: project.clients[0] ? { id: project.clients[0].id, secret } : null,
  };
}

export async function updateProjectForOrganization(
  id: string,
  organizationId: string,
  input: {
    name?: string;
    domain?: string | null;
    cors?: string[];
    crossDomain?: boolean;
    allowUnsafeRevenueTracking?: boolean;
  }
): Promise<IServiceProject | null> {
  const db = await loadDb();

  const existing = await db.project.findFirst({
    where: { id, organizationId },
    include: { clients: { select: { id: true } } },
  });

  if (!existing) {
    return null;
  }

  const updateData: Prisma.ProjectUpdateInput = {};
  if (input.name !== undefined) {
    updateData.name = input.name;
  }
  if (input.domain !== undefined) {
    updateData.domain = input.domain ? stripTrailingSlash(input.domain) : null;
  }
  if (input.cors !== undefined) {
    updateData.cors = input.cors.map((c) => stripTrailingSlash(c));
  }
  if (input.crossDomain !== undefined) {
    updateData.crossDomain = input.crossDomain;
  }
  if (input.allowUnsafeRevenueTracking !== undefined) {
    updateData.allowUnsafeRevenueTracking = input.allowUnsafeRevenueTracking;
  }

  const project = await db.project.update({
    where: { id },
    data: updateData,
  });

  await Promise.all([
    getProjectByIdCached.clear(project.id),
    ...existing.clients.map((client) => getClientByIdCached.clear(client.id)),
  ]);

  return project;
}

// Grace period between a scheduled deletion and the `delete` cron sweeping it
// up — matches V1's `addHours(new Date(), 24)` (trpc) and the manage
// controller's `Date.now() + 24 * 60 * 60 * 1000` (REST), same duration.
const DELETE_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

export async function deleteProjectForOrganization(
  id: string,
  organizationId: string
): Promise<boolean> {
  const db = await loadDb();

  const project = await db.project.findFirst({
    where: { id, organizationId },
  });

  if (!project) {
    return false;
  }

  await db.project.update({
    where: { id },
    data: {
      deleteAt: new Date(Date.now() + DELETE_GRACE_PERIOD_MS),
    },
  });

  await getProjectByIdCached.clear(id);

  return true;
}

// --- trpc project.delete / project.cancelDeletion ---
// Caller has already been proven a project (or organization) admin by
// requireProjectAdmin, so unlike the /manage functions above these take no
// organizationId and do no ownership re-check.

export async function scheduleProjectDeletion(id: string): Promise<void> {
  const db = await loadDb();
  await db.project.update({
    where: { id },
    data: { deleteAt: new Date(Date.now() + DELETE_GRACE_PERIOD_MS) },
  });
}

export async function cancelProjectDeletion(id: string): Promise<void> {
  const db = await loadDb();

  const project = await db.project.findUnique({
    where: { id },
    select: {
      organization: {
        select: { deleteAt: true },
      },
    },
  });

  // If the whole organization is scheduled for deletion, this project's
  // deletion is part of it and can only be cancelled at the organization
  // level. Cancelling it here would leave the organization unable to delete.
  if (project?.organization?.deleteAt) {
    throw new TRPCBadRequestError(
      'This organization is scheduled for deletion. Cancel the deletion from the organization settings.'
    );
  }

  await db.project.update({
    where: { id },
    data: { deleteAt: null },
  });
}
