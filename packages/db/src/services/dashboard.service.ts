import type { DashboardRole } from './access.service';
import type { Dashboard, Prisma } from '../prisma-client';
import { db } from '../prisma-client';

export type IServiceDashboard = Dashboard;
export type IServiceDashboards = (Prisma.DashboardGetPayload<{
  include: {
    project: true;
    reports: true;
  };
}> & { role: DashboardRole })[];

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
      _count: { select: { access: true } },
    },
  });
}

export function getDashboardsForUser({
  projectId,
  userId,
  isAdmin,
}: {
  projectId: string;
  userId: string;
  isAdmin: boolean;
}) {
  if (isAdmin) {
    return getDashboardsByProjectId(projectId).then((dashboards) =>
      dashboards.map((dashboard) => ({
        ...dashboard,
        sharedCount: dashboard._count.access,
        role: (dashboard.createdById === userId
          ? 'owner'
          : 'admin') as DashboardRole,
      })),
    );
  }

  return db.dashboard
    .findMany({
      where: {
        projectId,
        OR: [{ createdById: userId }, { access: { some: { userId } } }],
      },
      include: {
        project: true,
        reports: true,
        access: { where: { userId } },
        _count: { select: { access: true } },
      },
    })
    .then((dashboards) =>
      dashboards.map(({ access, ...dashboard }) => ({
        ...dashboard,
        sharedCount: dashboard._count.access,
        role: (dashboard.createdById === userId
          ? 'owner'
          : access[0]?.level === 'edit'
            ? 'edit'
            : 'view') as DashboardRole,
      })),
    );
}

export async function listDashboardsCore(input: {
  projectId: string;
  organizationId: string;
}) {
  return db.dashboard.findMany({
    where: { projectId: input.projectId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, projectId: true },
  });
}
