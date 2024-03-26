import { auth } from '@clerk/nextjs';
import { project } from 'ramda';

import type { Project } from '../prisma-client';
import { db } from '../prisma-client';

export type IServiceProject = ReturnType<typeof transformProject>;

export function transformProject({ organization_slug, ...project }: Project) {
  return {
    organizationSlug: organization_slug,
    ...project,
  };
}

export async function getProjectById(id: string) {
  const res = await db.project.findUnique({
    where: {
      id,
    },
  });

  if (!res) {
    return null;
  }

  return transformProject(res);
}

export async function getProjectsByOrganizationSlug(slug: string) {
  const res = await db.project.findMany({
    where: {
      organization_slug: slug,
    },
  });

  return res.map(transformProject);
}

export async function getCurrentProjects(slug: string) {
  const session = auth();
  if (!session.userId) {
    return [];
  }

  const access = await db.projectAccess.findMany({
    where: {
      organization_slug: slug,
      user_id: session.userId,
    },
  });

  const res = await db.project.findMany({
    where: {
      organization_slug: slug,
    },
  });

  if (access.length === 0) {
    return res.map(transformProject);
  }

  return res
    .filter((project) => access.some((a) => a.project_id === project.id))
    .map(transformProject);
}
