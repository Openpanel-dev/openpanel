import { cacheable } from '@openpanel/redis';
import type { Client, Prisma } from '../prisma-client';
import { db } from '../prisma-client';

export type IServiceClient = Client;
export type IServiceClientWithProject = Prisma.ClientGetPayload<{
  include: {
    project: true;
  };
}>;

export async function getClientsByOrganizationId(organizationId: string) {
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

export async function getClientById(
  id: string,
): Promise<IServiceClientWithProject | null> {
  return db.client.findUnique({
    where: { id },
    include: {
      project: true,
    },
  });
}

export const getClientByIdCached = cacheable(getClientById, 60 * 60 * 24);
