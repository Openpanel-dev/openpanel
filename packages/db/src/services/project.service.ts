import { db } from '../prisma-client';

export type IServiceProject = Awaited<ReturnType<typeof getProjectById>>;

export function getProjectById(id: string) {
  return db.project.findUnique({
    where: {
      id,
    },
  });
}

export function getProjectsByOrganizationSlug(slug: string) {
  return db.project.findMany({
    where: {
      organization_slug: slug,
    },
  });
}

export async function getProjectWithMostEvents(slug: string) {
  return db.project.findFirst({
    where: {
      organization_slug: slug,
    },
    orderBy: {
      eventsCount: 'desc',
    },
  });
}
