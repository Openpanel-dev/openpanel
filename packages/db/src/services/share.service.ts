import { db } from '../prisma-client';

export function getShareOverviewById(id: string) {
  return db.shareOverview.findFirst({
    where: {
      id,
    },
    include: {
      project: true,
    },
  });
}

export function getShareByProjectId(projectId: string) {
  return db.shareOverview.findUnique({
    where: {
      projectId,
    },
  });
}

export function getShareDashboardById(id: string) {
  return db.shareDashboard.findFirst({
    where: {
      id,
    },
    include: {
      dashboard: true,
    },
  });
}

export function getShareByDashboardId(dashboardId: string) {
  return db.shareDashboard.findUnique({
    where: {
      dashboardId,
    },
  });
}
