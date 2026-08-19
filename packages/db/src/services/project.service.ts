import { cacheable } from '@openpanel/redis';
import sqlstring from 'sqlstring';
import { chQuery, TABLE_NAMES } from '../clickhouse/client';
import { ClientType, type Prisma, type Project } from '../prisma-client';
import { db } from '../prisma-client';

export type IServiceProject = Project;
export type IServiceProjectWithClients = Prisma.ProjectGetPayload<{
  include: {
    clients: true;
  };
}>;

export async function getProjectById(id: string) {
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

/** L1 LRU (60s) + L2 Redis. clear() invalidates Redis + local LRU; other nodes may serve stale from LRU for up to 60s. */
export const getProjectByIdCached = cacheable(getProjectById, 60 * 60 * 24);

export async function getProjectWithClients(id: string) {
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
  const res = await chQuery<{ count: number }>(
    `SELECT sum(event_count) as count FROM ${TABLE_NAMES.event_names_mv} WHERE project_id = ${sqlstring.escape(projectId)} AND name NOT IN ('session_start', 'session_end')`
  );
  return res[0]?.count;
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
    throw new Error('projectId is required when using a root (organization-level) client');
  }

  const project = await db.project.findFirst({
    where: { id: inputProjectId, organizationId },
    select: { id: true },
  });

  if (!project) {
    throw new Error('Project not found or does not belong to your organization');
  }

  return inputProjectId;
}

export async function listProjectsCore(input: {
  clientType: 'root' | 'read';
  organizationId: string;
  projectId: string | null;
}) {
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
