import { db } from '../prisma-client';

export type IServiceDashboard = Awaited<ReturnType<typeof getDashboardById>>;
export type IServiceDashboards = Awaited<
  ReturnType<typeof getDashboardsByProjectId>
>;

export async function getDashboardById(id: string, projectId: string) {
  const dashboard = await db.dashboard.findUnique({
    where: {
      id,
      project_id: projectId,
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

export async function getDashboardsByOrganization(organizationSlug: string) {
  return db.dashboard.findMany({
    where: {
      organization_slug: organizationSlug,
    },
    include: {
      project: true,
    },
    orderBy: {
      reports: {
        _count: 'desc',
      },
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
