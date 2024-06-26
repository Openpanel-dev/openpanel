import type { Client, Prisma } from '../prisma-client';
import { db } from '../prisma-client';

export type IServiceClient = Client;
export type IServiceClientWithProject = Prisma.ClientGetPayload<{
  include: {
    project: true;
  };
}>;

export async function getClientsByOrganizationSlug(organizationSlug: string) {
  return db.client.findMany({
    where: {
      organizationSlug,
    },
    include: {
      project: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
}
