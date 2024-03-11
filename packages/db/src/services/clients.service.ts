import type { Client } from '../prisma-client';
import { db } from '../prisma-client';
import type { IServiceProject } from './project.service';

export type IServiceClient = Client;
export type IServiceClientWithProject = Client & {
  project: Exclude<IServiceProject, null>;
};

export function getClientsByOrganizationId(organizationId: string) {
  return db.client.findMany({
    where: {
      organization_slug: organizationId,
    },
    include: {
      project: true,
    },
  });
}
