// Moved from packages/db/src/services/project.service.ts (M6-002, module
// map: project owns "R,H,S,C"). packages/db keeps a re-export shim: its own
// access.service.ts and notification.service.ts still reach `getProjectById`
// / `getProjectByIdCached` through the same relative path, and
// apps/api/src/utils/auth.ts reaches them through @openpanel/db's barrel;
// auth.service.ts's permission ladder (M10-002) reaches a project through
// `shared/access-lookups.ts`, which has no `ServiceDeps` of its own to carry
// (M15-005: it reads Postgres from `context.ts`'s `unscopedDb()` instead).
//
// M10-004: every function takes `ServiceDeps` and reaches Postgres as
// `deps.db`; the `loadDb()` lazy loader is gone. M15-005: `getProjectByIdCached`
// is a module-scope `cacheablePerDb` for the same reason `getClientByIdCached`
// is in client.service.ts — see that file's header.
//
// M12-006 converted this module's two ClickHouse statements
// (`getProjectEventsCount` / `getLastEventPerProject`) onto the ADR-013 `sql`
// tag: every value binds as a `{pN:Type}` param, so `sqlstring` and `clix` are
// both gone. The CLIENT is `deps.ch` either way, through core's own `chQuery`
// (shared/ch-query.ts) — M10-009 dropped the `compatChHelpers()` hop these two
// used to make. The V1-vs-V2 result-set proof is `project.sql.proof.md` beside
// this file.

import crypto from 'node:crypto';
import { sql } from '@openpanel/db/src/clickhouse/sql';
import type {
  Prisma,
  Project,
  ProjectType,
} from '@openpanel/db/src/prisma-client';
import { TRPCBadRequestError } from '../../rpc/errors';
import type { ServiceDeps, Services } from '../../services';
import { cacheablePerDb, type DbScope } from '../../shared/cacheable-per-deps';
import { convertClickhouseDateToJs } from '../../shared/ch-dates';
import { chQuery } from '../../shared/ch-query';
import { TABLE_NAMES } from '../../shared/ch-tables';
import { getId } from '../../shared/slug-id';
import { stripTrailingSlash } from '../../shared/string';
import { hashPassword } from '../auth/auth.service';
import { getClientByIdCached } from '../client/client.service';

// The `sql` tag is a value import of `@openpanel/db` and stays one: it is a
// compile-time template tag holding no client (see shared/ch-query.ts).
// `TABLE_NAMES` and the date helper are core's own copies
// (shared/ch-tables.ts, shared/ch-dates.ts).
//
// clix sent `clickhouse_settings.session_timezone = 'UTC'` on every
// `execute()` — `clix(client)` with no timezone argument defaults to it
// (query-builder.ts:696-697, :562). `getLastEventPerProject` came off clix and
// keeps sending it so its result set stays identical; `getProjectEventsCount`
// was already a raw `chQuery` call, sent none, and still sends none.
const CLIX_SESSION_TIMEZONE = { session_timezone: 'UTC' } as const;
// Session bookkeeping rows are worker-generated (the reaper can emit
// session_end after tracking already stopped) — only real tracking activity
// counts. V1 wrote this list inline in both statements.
const NON_TRACKING_EVENT_NAMES = ['session_start', 'session_end'];
export type IServiceProject = Project;
export type IServiceProjectWithClients = Prisma.ProjectGetPayload<{
  include: {
    clients: true;
  };
}>;

const DAY_IN_SECONDS = 60 * 60 * 24;

export async function getProjectById(deps: DbScope, id: string) {
  const res = await deps.db.project.findUnique({
    where: {
      id,
    },
  });

  if (!res) {
    return null;
  }

  return res;
}

/**
 * L1 LRU (60s) + L2 Redis, one instance per Postgres client — the ingest
 * consumer, `/track` and mcp all read and invalidate the same one. The name is
 * EMPTY for the same reason `getClientByIdCached`'s is: the in-factory
 * `cacheable(...)` this replaces took an anonymous arrow, so the Redis key is
 * `cachable::<id>`.
 */
export const getProjectByIdCached = cacheablePerDb(
  '',
  getProjectById,
  DAY_IN_SECONDS
);

export async function getProjectWithClients(deps: ServiceDeps, id: string) {
  const res = await deps.db.project.findUnique({
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

export async function getProjects(
  deps: ServiceDeps,
  {
    organizationId,
    userId,
  }: {
    organizationId: string;
    userId: string | null;
  }
) {
  if (!userId) {
    return [];
  }

  const [projects, members, access] = await Promise.all([
    deps.db.project.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        eventsCount: 'desc',
      },
    }),
    deps.db.member.findMany({
      where: {
        userId,
        organizationId,
      },
    }),
    deps.db.projectAccess.findMany({
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
export const getProjectEventsCount = async (
  deps: ServiceDeps,
  projectId: string
) => {
  const res = await chQuery<{ count: number }>(
    deps,
    sql`SELECT sum(event_count) as count FROM ${sql.id(TABLE_NAMES.event_names_mv)} WHERE project_id = ${sql.string(projectId)} AND name NOT IN ${sql.array('String', NON_TRACKING_EVENT_NAMES)}`
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
export const getLastEventPerProject = async (
  deps: ServiceDeps
): Promise<Map<string, Date>> => {
  const res = await chQuery<{ project_id: string; last_event_at: string }>(
    deps,
    sql`
      SELECT project_id, max(created_at) AS last_event_at
      FROM ${sql.id(TABLE_NAMES.event_names_mv)}
      WHERE name NOT IN ${sql.array('String', NON_TRACKING_EVENT_NAMES)}
      GROUP BY project_id
    `,
    CLIX_SESSION_TIMEZONE
  );
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
export async function resolveClientProjectId(
  deps: ServiceDeps,
  {
    clientType,
    clientProjectId,
    organizationId,
    inputProjectId,
  }: {
    clientType: 'read' | 'root';
    clientProjectId: string | null;
    organizationId: string;
    inputProjectId: string | undefined;
  }
): Promise<string> {
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

  const project = await deps.db.project.findFirst({
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
  deps: ServiceDeps,
  projectId: string
): Promise<ProjectActivationStatus> {
  const project = await deps.db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      firstEventAt: true,
      eventsCount: true,
      organizationId: true,
      createdAt: true,
    },
  });

  const [reportCount, memberCount] = await Promise.all([
    deps.db.report.count({ where: { projectId } }),
    deps.db.member.count({ where: { organizationId: project.organizationId } }),
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

export async function listProjectsCore(
  deps: ServiceDeps,
  input: {
    clientType: 'root' | 'read';
    organizationId: string;
    projectId: string | null;
  }
) {
  if (input.clientType === 'root') {
    const projects = await deps.db.project.findMany({
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
    ? await deps.db.project.findUnique({
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

export async function listProjectsForOrganization(
  deps: ServiceDeps,
  organizationId: string
) {
  return deps.db.project.findMany({
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
  deps: ServiceDeps,
  id: string,
  organizationId: string
) {
  return deps.db.project.findFirst({
    where: {
      id,
      organizationId,
    },
  });
}

// Grace period between a scheduled deletion and the `delete` cron sweeping it
// up — matches V1's `addHours(new Date(), 24)` (trpc) and the manage
// controller's `Date.now() + 24 * 60 * 60 * 1000` (REST), same duration.
const DELETE_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

export function createProjectService(
  deps: ServiceDeps,
  _services: () => Services
) {
  async function createProjectForOrganization(
    organizationId: string,
    input: {
      name: string;
      domain?: string | null;
      cors: string[];
      crossDomain: boolean;
      types: ProjectType[];
    }
  ): Promise<{
    project: IServiceProject;
    client: CreatedProjectClient | null;
  }> {
    const secret = `sec_${crypto.randomBytes(10).toString('hex')}`;
    const project = await deps.db.project.create({
      data: {
        id: await getId(deps, 'project', input.name),
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
      getProjectByIdCached.clear(deps, project.id),
      ...project.clients.map((client) =>
        getClientByIdCached.clear(deps, client.id)
      ),
    ]);

    return {
      project,
      client: project.clients[0] ? { id: project.clients[0].id, secret } : null,
    };
  }

  async function updateProjectForOrganization(
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
    const existing = await deps.db.project.findFirst({
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
      updateData.domain = input.domain
        ? stripTrailingSlash(input.domain)
        : null;
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

    const project = await deps.db.project.update({
      where: { id },
      data: updateData,
    });

    await Promise.all([
      getProjectByIdCached.clear(deps, project.id),
      ...existing.clients.map((client) =>
        getClientByIdCached.clear(deps, client.id)
      ),
    ]);

    return project;
  }

  async function deleteProjectForOrganization(
    id: string,
    organizationId: string
  ): Promise<boolean> {
    const project = await deps.db.project.findFirst({
      where: { id, organizationId },
    });

    if (!project) {
      return false;
    }

    await deps.db.project.update({
      where: { id },
      data: {
        deleteAt: new Date(Date.now() + DELETE_GRACE_PERIOD_MS),
      },
    });

    await getProjectByIdCached.clear(deps, id);

    return true;
  }

  // --- trpc project.delete / project.cancelDeletion ---
  // Caller has already been proven a project (or organization) admin by
  // requireProjectAdmin, so unlike the /manage functions above these take no
  // organizationId and do no ownership re-check.

  async function scheduleProjectDeletion(id: string): Promise<void> {
    await deps.db.project.update({
      where: { id },
      data: { deleteAt: new Date(Date.now() + DELETE_GRACE_PERIOD_MS) },
    });
  }

  async function cancelProjectDeletion(id: string): Promise<void> {
    const project = await deps.db.project.findUnique({
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

    await deps.db.project.update({
      where: { id },
      data: { deleteAt: null },
    });
  }

  return {
    getProjectById: (id: string): ReturnType<typeof getProjectById> =>
      getProjectById(deps, id),
    getProjectByIdCached: (id: string): ReturnType<typeof getProjectById> =>
      getProjectByIdCached(deps, id),
    /** Invalidates a single id in `getProjectByIdCached`'s L1 LRU + Redis —
     *  `ingest/src/incoming-event-handler.ts` calls the module-scope spelling
     *  right after marking a project's first event. */
    clearProjectByIdCache: (id: string): Promise<number> =>
      getProjectByIdCached.clear(deps, id),
    getProjectWithClients: (
      id: string
    ): ReturnType<typeof getProjectWithClients> =>
      getProjectWithClients(deps, id),
    getProjects: (
      input: Parameters<typeof getProjects>[1]
    ): ReturnType<typeof getProjects> => getProjects(deps, input),
    getProjectEventsCount: (
      projectId: string
    ): ReturnType<typeof getProjectEventsCount> =>
      getProjectEventsCount(deps, projectId),
    getLastEventPerProject: (): ReturnType<typeof getLastEventPerProject> =>
      getLastEventPerProject(deps),
    resolveClientProjectId: (
      input: Parameters<typeof resolveClientProjectId>[1]
    ): ReturnType<typeof resolveClientProjectId> =>
      resolveClientProjectId(deps, input),
    getProjectActivationStatus: (
      projectId: string
    ): ReturnType<typeof getProjectActivationStatus> =>
      getProjectActivationStatus(deps, projectId),
    listProjectsCore: (
      input: Parameters<typeof listProjectsCore>[1]
    ): ReturnType<typeof listProjectsCore> => listProjectsCore(deps, input),
    listProjectsForOrganization: (
      organizationId: string
    ): ReturnType<typeof listProjectsForOrganization> =>
      listProjectsForOrganization(deps, organizationId),
    getProjectForOrganization: (
      id: string,
      organizationId: string
    ): ReturnType<typeof getProjectForOrganization> =>
      getProjectForOrganization(deps, id, organizationId),
    createProjectForOrganization,
    updateProjectForOrganization,
    deleteProjectForOrganization,
    scheduleProjectDeletion,
    cancelProjectDeletion,
  };
}
