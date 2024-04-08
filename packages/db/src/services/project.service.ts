import { auth } from '@clerk/nextjs';

import type { Project } from '../prisma-client';
import { db } from '../prisma-client';

export type IServiceProject = Project;

export async function getProjectById(id: string) {
  const res = await db.project.findUnique({
    where: {
      id,
    },
  });

  if (!res) {
    return null;
  }

  return res;
}

export async function getProjectsByOrganizationSlug(organizationSlug: string) {
  return db.project.findMany({
    where: {
      organizationSlug,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export async function getCurrentProjects(organizationSlug: string) {
  const session = auth();
  if (!session.userId) {
    return [];
  }

  return db.project.findMany({
    where: {
      organizationSlug,
    },
    include: {
      access: true,
    },
  });
}
