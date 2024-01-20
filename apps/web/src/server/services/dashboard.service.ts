import { unstable_cache } from 'next/cache';

import { db } from '../db';

export type IServiceRecentDashboards = Awaited<
  ReturnType<typeof getRecentDashboardsByUserId>
>;
export type IServiceDashboard = Awaited<ReturnType<typeof getDashboardById>>;
export type IServiceDashboardWithProject = Awaited<
  ReturnType<typeof getDashboardsByProjectId>
>[number];

export function getDashboardById(id: string) {
  return db.dashboard.findUniqueOrThrow({
    where: {
      id,
    },
  });
}

export function getDashboardsByProjectId(projectId: string) {
  return db.dashboard.findMany({
    where: {
      project_id: projectId,
    },
    include: {
      project: true,
    },
  });
}

export async function getRecentDashboardsByUserId(userId: string) {
  const tag = `recentDashboards_${userId}`;

  return unstable_cache(
    async (userId: string) => {
      return db.recentDashboards.findMany({
        where: {
          user_id: userId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          project: true,
          dashboard: true,
        },
        take: 5,
      });
    },
    tag.split('_'),
    {
      revalidate: 3600,
      tags: [tag],
    }
  )(userId);
}

export async function createRecentDashboard({
  organizationId,
  projectId,
  dashboardId,
  userId,
}: {
  organizationId: string;
  projectId: string;
  dashboardId: string;
  userId: string;
}) {
  await db.recentDashboards.deleteMany({
    where: {
      user_id: userId,
      project_id: projectId,
      dashboard_id: dashboardId,
      organization_id: organizationId,
    },
  });
  return db.recentDashboards.create({
    data: {
      user_id: userId,
      organization_id: organizationId,
      project_id: projectId,
      dashboard_id: dashboardId,
    },
  });
}
