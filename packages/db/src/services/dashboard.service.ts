import type { Dashboard, Prisma } from '../prisma-client';
import { db } from '../prisma-client';

export type IServiceDashboard = Dashboard;
export type IServiceDashboards = Prisma.DashboardGetPayload<{
  include: {
    project: true;
    reports: true;
  };
}>[];

export async function getDashboardById(id: string, projectId: string) {
  const dashboard = await db.dashboard.findUnique({
    where: {
      id,
      projectId,
    },
    include: {
      project: true,
    },
  });

  if (!dashboard) {
    return null;
  }

  return dashboard;
}

export function getDashboardsByProjectId(projectId: string) {
  return db.dashboard.findMany({
    where: {
      projectId,
    },
    include: {
      project: true,
      reports: true,
    },
  });
}
