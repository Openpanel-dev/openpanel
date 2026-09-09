// Moved from packages/db/src/services/clients.service.ts (M6-002, module
// map: client owns "R,H,S" — no constants file, per the module map). packages/db
// keeps a re-export shim: apps/api/src/utils/auth.ts and core's mcp module
// still reach `getClientByIdCached` / `ClientType` through @openpanel/db's
// barrel — same shape as packages/db/src/services/organization.service.ts
// since M6-001.
//
// The /manage REST CRUD bodies (apps/api/src/controllers/manage.controller.ts's
// listClients/getClient/createClient/updateClient/deleteClient) move here
// too, so V1's controller and core's own client.routes.ts share one
// implementation (DELEGATE PATTERN).
//
// M10-004: every function takes `ServiceDeps` and reaches Postgres as
// `deps.db`; the `loadDb()` lazy loader is gone. No dependency on
// project.service.ts here (the reverse direction exists, for cache
// invalidation) — project-ownership checks below query `db.project`
// directly, matching V1's manage.controller.ts exactly.
//
// `getClientByIdCached` lives INSIDE `createClientService(deps)` rather than
// at module scope: its `cacheable(...)` L1 LRU must survive across calls to
// stay useful, which only holds if the closure it is built in is a
// singleton. `ctx.services.client` is one Ctx per request, so this cache is
// only actually a cross-call singleton through the v1-compat seam
// (`registered`, built exactly once at boot) — see v1-compat.ts's header —
// which is what `ingest/src/client-auth.ts`, `http/client-auth.ts` and
// `mcp/src/auth.ts` read through, on the ingest hot path, with no `Ctx` of
// their own to carry `ServiceDeps`.

import crypto from 'node:crypto';
import type { Client, Prisma } from '@openpanel/db/src/prisma-client';
import { cacheable } from '@openpanel/redis';
import type { ServiceDeps, Services } from '../../services';
import { hashPassword } from '../auth/auth.service';

export type IServiceClient = Client;
export type IServiceClientWithProject = Prisma.ClientGetPayload<{
  include: {
    project: true;
  };
}>;

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
  deps: ServiceDeps,
  id: string
): Promise<IServiceClientWithProject | null> {
  return deps.db.client.findUnique({
    where: { id },
    include: {
      project: true,
    },
  });
}

// --- /manage REST CRUD (apps/api/src/controllers/manage.controller.ts) ---

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
  /** L1 LRU (60s) + L2 Redis. clear() invalidates Redis + local LRU; other nodes may serve stale from LRU for up to 60s. */
  const getClientByIdCached = cacheable(
    (id: string) => getClientById(deps, id),
    FIVE_MINUTES_IN_SECONDS
  );

  async function createClientForOrganization(
    organizationId: string,
    input: {
      name: string;
      projectId?: string | null;
      type?: 'read' | 'write' | 'root';
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
        secret: await hashPassword(secret),
      },
    });

    await getClientByIdCached.clear(client.id);

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

    await getClientByIdCached.clear(client.id);

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
    await getClientByIdCached.clear(id);

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
    ): Promise<IServiceClientWithProject | null> => getClientByIdCached(id),
    /** Invalidates a single id in `getClientByIdCached`'s L1 LRU + Redis. Its
     *  own create/update/delete already call this; `project.service.ts`
     *  reaches it too, through the v1-compat singleton, to invalidate a
     *  project's clients on a project mutation — see that file's header. */
    clearClientByIdCache: (id: string): Promise<number> =>
      getClientByIdCached.clear(id),
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
