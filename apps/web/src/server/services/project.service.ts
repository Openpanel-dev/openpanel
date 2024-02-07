import { unstable_cache } from 'next/cache';

import { db } from '../db';
import { getCurrentOrganization } from './organization.service';

export type IServiceProject = Awaited<ReturnType<typeof getProjectById>>;

export function getProjectById(id: string) {
  return db.project.findUnique({
    where: {
      id,
    },
  });
}

export async function getCurrentProjects() {
  const organization = await getCurrentOrganization();
  if (!organization?.slug) return [];
  return await db.project.findMany({
    where: {
      organization_slug: organization.slug,
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
