// Moved from V1's clients service (M6-002, module map: client owns "R,H,S" —
// no constants file, per the module map). Client CRUD lives only here now;
// no packages/db re-export shim exists in this tree.
//
// The /manage REST CRUD bodies (client.routes.ts's listClients/getClient/
// createClient/updateClient/deleteClient) call the same
// create/update/delete/list functions the tRPC router (client.rpc.ts) does.
//
// M10-004: every function takes `ServiceDeps` and reaches Postgres as
// `deps.db`; the `loadDb()` lazy loader is gone. No dependency on
// project.service.ts here (the reverse direction exists, for cache
// invalidation) — project-ownership checks below query `db.project`
// directly.
//
// M15-005: `getClientByIdCached` is a module-scope `cacheablePerDb`, keyed on
// the Postgres client rather than on the scope. Its L1 LRU has to survive
// across calls to be worth anything, and the ingest hot path
// (`ingest/src/client-auth.ts`, `http/client-auth.ts`) now passes the scope it
// holds instead of reading a boot-scoped singleton through the deleted compat
// seam. One instance per process to read, one to invalidate.

import crypto from 'node:crypto';
import type { Client, Prisma } from '@openpanel/db/src/prisma-client';
import { cacheablePerDb, type DbScope } from '../../cacheable-per-deps';
import type { ServiceDeps, Services } from '../../services';
import { hashClientSecret } from '../../shared/client-secret';

export type IServiceClient = Client;
export type IServiceClientWithProject = Prisma.ClientGetPayload<{
  include: {
    project: true;
  };
}>;

// Single source for the three client tiers — Prisma's own `ClientType` enum
// (schema.prisma) is a `@openpanel/db` VALUE import, which
// `core-uses-ctx-not-db-internals` forbids outside the four named seams, so
// this is declared here instead and reused by client.rpc.ts / client.routes.ts.
export const CLIENT_TYPES = ['read', 'write', 'root'] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

const FIVE_MINUTES_IN_SECONDS = 60 * 5;

export async function getClientsByOrganizationId(
  deps: ServiceDeps,
  organizationId: string
) {
  return deps.db.client.findMany({
    where: {
      organizationId,
    },
    include: {
      project: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
}

/** trpc client.list — no access check of its own, ported verbatim. */
export async function getClientsByProjectId(
  deps: ServiceDeps,
  projectId: string
) {
  return deps.db.client.findMany({
    where: {
      projectId,
    },
  });
}

export async function getClientById(
  deps: DbScope,
  id: string
): Promise<IServiceClientWithProject | null> {
  return deps.db.client.findUnique({
    where: { id },
    include: {
      project: true,
    },
  });
}

/**
 * L1 LRU (60s) + L2 Redis, one instance per Postgres client. `clear()`
 * invalidates Redis and that LRU; other nodes may serve stale from theirs for
 * up to 60s.
 *
 * The name is EMPTY on purpose: the in-factory `cacheable(...)` this replaces
 * was handed an anonymous arrow, so `fn.name` was `''` and the Redis key is
 * `cachable::<id>`. Naming it here would orphan every live entry.
 */
export const getClientByIdCached = cacheablePerDb(
  '',
  getClientById,
  FIVE_MINUTES_IN_SECONDS
);

// --- /manage REST CRUD (client.routes.ts) ---

export async function listClientsForOrganization(
  deps: ServiceDeps,
  organizationId: string,
  projectId?: string
) {
  if (projectId) {
    const project = await deps.db.project.findFirst({
      where: { id: projectId, organizationId },
    });
    if (!project) {
      return null;
    }
  }

  return deps.db.client.findMany({
    where: {
      organizationId,
      ...(projectId ? { projectId } : {}),
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export async function getClientForOrganization(
  deps: ServiceDeps,
  id: string,
  organizationId: string
) {
  return deps.db.client.findFirst({
    where: {
      id,
      organizationId,
    },
  });
}

export interface CreatedClient {
  client: IServiceClient;
  secret: string;
}

export function createClientService(
  deps: ServiceDeps,
  _services: () => Services
) {
  async function createClientForOrganization(
    organizationId: string,
    input: {
      name: string;
      projectId?: string | null;
      type?: ClientType;
    }
  ): Promise<CreatedClient | null> {
    if (input.projectId) {
      const project = await deps.db.project.findFirst({
        where: { id: input.projectId, organizationId },
      });
      if (!project) {
        return null;
      }
    }

    const secret = `sec_${crypto.randomBytes(10).toString('hex')}`;
    const client = await deps.db.client.create({
      data: {
        organizationId,
        projectId: input.projectId || null,
        name: input.name,
        type: input.type || 'write',
        secret: await hashClientSecret(secret),
      },
    });

    await getClientByIdCached.clear(deps, client.id);

    return { client, secret };
  }

  async function updateClientForOrganization(
    id: string,
    organizationId: string,
    input: { name?: string }
  ): Promise<IServiceClient | null> {
    const existing = await deps.db.client.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return null;
    }

    const updateData: Prisma.ClientUpdateInput = {};
    if (input.name !== undefined) {
      updateData.name = input.name;
    }

    const client = await deps.db.client.update({
      where: { id },
      data: updateData,
    });

    await getClientByIdCached.clear(deps, client.id);

    return client;
  }

  async function deleteClientForOrganization(
    id: string,
    organizationId: string
  ): Promise<boolean> {
    const client = await deps.db.client.findFirst({
      where: { id, organizationId },
    });

    if (!client) {
      return false;
    }

    await deps.db.client.delete({ where: { id } });
    await getClientByIdCached.clear(deps, id);

    return true;
  }

  return {
    getClientsByOrganizationId: (
      organizationId: string
    ): ReturnType<typeof getClientsByOrganizationId> =>
      getClientsByOrganizationId(deps, organizationId),
    getClientsByProjectId: (
      projectId: string
    ): ReturnType<typeof getClientsByProjectId> =>
      getClientsByProjectId(deps, projectId),
    getClientById: (id: string): ReturnType<typeof getClientById> =>
      getClientById(deps, id),
    getClientByIdCached: (
      id: string
    ): Promise<IServiceClientWithProject | null> =>
      getClientByIdCached(deps, id),
    /** Invalidates a single id in `getClientByIdCached`'s L1 LRU + Redis. Its
     *  own create/update/delete already call this; `project.service.ts` calls
     *  the module-scope spelling to invalidate a project's clients on a
     *  project mutation. */
    clearClientByIdCache: (id: string): Promise<number> =>
      getClientByIdCached.clear(deps, id),
    listClientsForOrganization: (
      organizationId: string,
      projectId?: string
    ): ReturnType<typeof listClientsForOrganization> =>
      listClientsForOrganization(deps, organizationId, projectId),
    getClientForOrganization: (
      id: string,
      organizationId: string
    ): ReturnType<typeof getClientForOrganization> =>
      getClientForOrganization(deps, id, organizationId),
    createClientForOrganization,
    updateClientForOrganization,
    deleteClientForOrganization,
  };
}
