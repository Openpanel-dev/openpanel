import { cacheable, getRedisCache } from '@openpanel/redis';
import sqlstring from 'sqlstring';
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
  const res = await db.$primary().project.findUnique({
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
      eventsCount: 'desc',
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

const getProjectEventsCountUncached = async (projectId: string) => {
  const lockKey = `lock:project-events-count:${projectId}`;
  const redis = getRedisCache();

  // Try to acquire lock to prevent thundering herd across workers
  const acquired = await redis.set(lockKey, '1', 'EX', 30, 'NX');

  if (!acquired) {
    // Another worker is executing this query, skip - they'll update the count
    return null;
  }

  try {
    const res = await chQuery<{ count: number }>(
      `SELECT count(*) as count FROM ${TABLE_NAMES.events} WHERE project_id = ${sqlstring.escape(projectId)} AND name NOT IN ('session_start', 'session_end')`,
    );
    return res[0]?.count;
  } finally {
    // Release lock
    redis.del(lockKey).catch(() => {});
  }
};

export const getProjectEventsCount = cacheable(
  getProjectEventsCountUncached,
  60 * 60, // 1 hour cache
);
