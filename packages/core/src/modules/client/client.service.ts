// Moved from packages/db/src/services/clients.service.ts (M6-002, module
// map: client owns "R,H,S" — no constants file, per the module map). packages/db
// keeps a re-export shim: apps/api/src/utils/auth.ts, core's mcp module and
// several other core modules' `src/access.ts` still reach `getClientByIdCached`
// / `ClientType` through @openpanel/db's barrel — same shape as
// packages/db/src/services/organization.service.ts since M6-001.
//
// The /manage REST CRUD bodies (apps/api/src/controllers/manage.controller.ts's
// listClients/getClient/createClient/updateClient/deleteClient) move here
// too, so V1's controller and core's own client.routes.ts share one
// implementation (DELEGATE PATTERN).
//
// db access is LAZY (`loadDb` below), not a static top-level import — see
// project.service.ts's header for the full reasoning. No dependency on
// project.service.ts here (the reverse direction exists, for cache
// invalidation) — project-ownership checks below query `db.project`
// directly, matching V1's manage.controller.ts exactly.

import crypto from 'node:crypto';
import type { Client, Prisma } from '@openpanel/db/src/prisma-client';
import { cacheable } from '@openpanel/redis';
import { hashPassword } from '../auth/auth.service';

export type IServiceClient = Client;
export type IServiceClientWithProject = Prisma.ClientGetPayload<{
  include: {
    project: true;
  };
}>;

function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

export async function getClientsByOrganizationId(organizationId: string) {
  const db = await loadDb();
  return db.client.findMany({
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
export async function getClientsByProjectId(projectId: string) {
  const db = await loadDb();
  return db.client.findMany({
    where: {
      projectId,
    },
  });
}

export async function getClientById(
  id: string
): Promise<IServiceClientWithProject | null> {
  const db = await loadDb();
  return db.client.findUnique({
    where: { id },
    include: {
      project: true,
    },
  });
}

const FIVE_MINUTES_IN_SECONDS = 60 * 5;
export const getClientByIdCached = cacheable(
  getClientById,
  FIVE_MINUTES_IN_SECONDS
);

// --- /manage REST CRUD (apps/api/src/controllers/manage.controller.ts) ---

export async function listClientsForOrganization(
  organizationId: string,
  projectId?: string
) {
  const db = await loadDb();

  if (projectId) {
    const project = await db.project.findFirst({
      where: { id: projectId, organizationId },
    });
    if (!project) {
      return null;
    }
  }

  return db.client.findMany({
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
  id: string,
  organizationId: string
) {
  const db = await loadDb();
  return db.client.findFirst({
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

export async function createClientForOrganization(
  organizationId: string,
  input: {
    name: string;
    projectId?: string | null;
    type?: 'read' | 'write' | 'root';
  }
): Promise<CreatedClient | null> {
  const db = await loadDb();

  if (input.projectId) {
    const project = await db.project.findFirst({
      where: { id: input.projectId, organizationId },
    });
    if (!project) {
      return null;
    }
  }

  const secret = `sec_${crypto.randomBytes(10).toString('hex')}`;
  const client = await db.client.create({
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

export async function updateClientForOrganization(
  id: string,
  organizationId: string,
  input: { name?: string }
): Promise<IServiceClient | null> {
  const db = await loadDb();

  const existing = await db.client.findFirst({
    where: { id, organizationId },
  });

  if (!existing) {
    return null;
  }

  const updateData: Prisma.ClientUpdateInput = {};
  if (input.name !== undefined) {
    updateData.name = input.name;
  }

  const client = await db.client.update({
    where: { id },
    data: updateData,
  });

  await getClientByIdCached.clear(client.id);

  return client;
}

export async function deleteClientForOrganization(
  id: string,
  organizationId: string
): Promise<boolean> {
  const db = await loadDb();

  const client = await db.client.findFirst({
    where: { id, organizationId },
  });

  if (!client) {
    return false;
  }

  await db.client.delete({ where: { id } });
  await getClientByIdCached.clear(id);

  return true;
}
