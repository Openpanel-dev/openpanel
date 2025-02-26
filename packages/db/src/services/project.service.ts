import { cacheable } from '@openpanel/redis';
import { escape } from 'sqlstring';
import { TABLE_NAMES, chQuery } from '../clickhouse/client';
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

export async function getProjects({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string | null;
}) {
  if (!userId) {
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
        userId,
        organizationId,
      },
    }),
    db.projectAccess.findMany({
      where: {
        userId,
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

export const getProjectEventsCount = async (projectId: string) => {
  const res = await chQuery<{ count: number }>(
    `SELECT count(*) as count FROM ${TABLE_NAMES.events} WHERE project_id = ${escape(projectId)}`,
  );
  return res[0]?.count;
};
