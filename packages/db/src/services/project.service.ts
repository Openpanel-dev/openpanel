import { auth } from '@clerk/nextjs/server';

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

  const [projects, members, access] = await Promise.all([
    db.project.findMany({
      where: {
        organizationSlug,
      },
    }),
    db.member.findMany({
      where: {
        userId: session.userId,
        organizationId: organizationSlug,
      },
    }),
    db.projectAccess.findMany({
      where: {
        userId: session.userId,
      },
    }),
  ]);

  if (members.length === 0) {
    return [];
  }

  if (access.length > 0) {
    return projects.filter((project) =>
      access.some((a) => a.projectId === project.id)
    );
  }

  return projects;
}
