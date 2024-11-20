import { auth } from '@clerk/nextjs/server';

import { cacheable } from '@openpanel/redis';
import type { Prisma, Project } from '../prisma-client';
import { db } from '../prisma-client';

export type IServiceProject = Project;
export type IServiceProjectWithClients = Prisma.ProjectGetPayload<{
  include: {
    clients: true;
  };
}>;

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

export const getProjectByIdCached = cacheable(getProjectById, 60 * 60 * 24);

export async function getProjectWithClients(id: string) {
  const res = await db.project.findUnique({
    where: {
      id,
    },
    include: {
      clients: true,
    },
  });

  if (!res) {
    return null;
  }

  return res;
}

export async function getProjectsByOrganizationId(organizationId: string) {
  return db.project.findMany({
    where: {
      organizationId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export async function getCurrentProjects(organizationId: string) {
  const session = auth();
  if (!session.userId) {
    return [];
  }

  const [projects, members, access] = await Promise.all([
    db.project.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        eventsCount: 'desc',
      },
    }),
    db.member.findMany({
      where: {
        userId: session.userId,
        organizationId,
      },
    }),
    db.projectAccess.findMany({
      where: {
        userId: session.userId,
        organizationId,
      },
    }),
  ]);

  if (members.length === 0) {
    return [];
  }

  if (access.length > 0) {
    return projects.filter((project) =>
      access.some((a) => a.projectId === project.id),
    );
  }

  return projects;
}
