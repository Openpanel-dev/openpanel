import { unstable_cache } from 'next/cache';

import { db } from '../db';

export type IServiceProject = Awaited<ReturnType<typeof getProjectById>>;

export function getProjectById(id: string) {
  return db.project.findUnique({
    where: {
      id,
    },
  });
}

export function getProjectsByOrganizationId(organizationId: string) {
  return db.project.findMany({
    where: {
      organization_id: organizationId,
    },
  });
}

export function getFirstProjectByOrganizationId(organizationId: string) {
  const tag = `getFirstProjectByOrganizationId_${organizationId}`;
  return unstable_cache(
    async (organizationId: string) => {
      return db.project.findFirst({
        where: {
          organization_id: organizationId,
        },
        orderBy: {
          events: {
            _count: 'desc',
          },
        },
      });
    },
    tag.split('_'),
    {
      tags: [tag],
      revalidate: 3600 * 24,
    }
  )(organizationId);
}
