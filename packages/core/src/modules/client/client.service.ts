// `getClientByIdCached` is a module-scope `cacheablePerDb`, keyed on the Postgres
// client rather than the scope: its L1 LRU has to survive across calls, and the
// ingest hot path passes the scope it holds on each call.

import crypto from 'node:crypto';
import type { Client, Prisma } from '@openpanel/db/src/prisma-client';
import { cacheablePerDb, type DbScope } from '../../cacheable-per-deps';
import type { ServiceDeps, Services } from '../../services';
import { hashClientSecret } from '../../shared/client-secret';

export type IServiceClient = Client;

/**
 * What a read path may return. The stored `secret` is a hash that is never
 * retrievable after creation, so every path but the one authentication uses drops it.
 */
export type IPublicClient = Omit<Client, 'secret'>;

/** Handed to Prisma by every read path that serves a response. */
const OMIT_SECRET = { secret: true } as const;
export type IServiceClientWithProject = Prisma.ClientGetPayload<{
  include: {
    project: true;
  };
}>;

// Declared here because Prisma's `ClientType` enum would be an `@openpanel/db`
// value import, which core forbids outside the named seams.
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
    omit: OMIT_SECRET,
    include: {
      project: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
}

/** No access check of its own; callers must authorize before calling. */
export async function getClientsByProjectId(
  deps: ServiceDeps,
  projectId: string
) {
  return deps.db.client.findMany({
    where: {
      projectId,
    },
    omit: OMIT_SECRET,
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
 * The name is EMPTY on purpose: the Redis key is `cachable::<id>` and naming it
 * would orphan every live entry.
 */
export const getClientByIdCached = cacheablePerDb(
  '',
  getClientById,
  FIVE_MINUTES_IN_SECONDS
);

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
    omit: OMIT_SECRET,
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
    omit: OMIT_SECRET,
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
  ): Promise<IPublicClient | null> {
    const existing = await deps.db.client.findFirst({
      where: { id, organizationId },
      select: { id: true },
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
      omit: OMIT_SECRET,
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
    /** Invalidates a single id in `getClientByIdCached`'s L1 LRU + Redis. */
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
