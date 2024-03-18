import type { Client } from '../prisma-client';
import { db } from '../prisma-client';
import { transformProject } from './project.service';
import type { IServiceProject } from './project.service';

export type IServiceClient = ReturnType<typeof transformClient>;
export type IServiceClientWithProject = IServiceClient & {
  project: Exclude<IServiceProject, null>;
};

export function transformClient({ organization_slug, ...client }: Client) {
  return {
    ...client,
    organizationSlug: organization_slug,
  };
}

export async function getClientsByOrganizationId(organizationId: string) {
  const clients = await db.client.findMany({
    where: {
      organization_slug: organizationId,
    },
    include: {
      project: true,
    },
  });

  return clients
    .map((client) => {
      return {
        ...transformClient(client),
        project: transformProject(client.project),
      };
    })
    .filter(
      (client): client is IServiceClientWithProject => client.project !== null
    );
}
