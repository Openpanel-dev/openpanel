import { cacheable } from '@openpanel/redis';
import { db } from '../prisma-client';
import { getProjectById } from './project.service';

export const getProjectAccess = cacheable(
  'getProjectAccess',
  async ({ userId, projectId }: { userId: string; projectId: string }) => {
    try {
      // Check if user has access to the project
      const project = await getProjectById(projectId);
      if (!project?.organizationId) {
        return false;
      }

      const [projectAccess, member] = await Promise.all([
        db.projectAccess.findMany({
          where: {
            userId,
            organizationId: project.organizationId,
          },
        }),
        db.member.findFirst({
          where: {
            organizationId: project.organizationId,
            userId,
          },
        }),
      ]);

      if (projectAccess.length === 0 && member) {
        return true;
      }

      return projectAccess.find((item) => item.projectId === projectId);
    } catch (err) {
      return false;
    }
  },
  60 * 5
);

export const getOrganizationAccess = cacheable(
  'getOrganizationAccess',
  async ({
    userId,
    organizationId,
  }: {
    userId: string;
    organizationId: string;
  }) => {
    return db.member.findFirst({
      where: {
        userId,
        organizationId,
      },
    });
  },
  60 * 5
);

export type DashboardRole = 'owner' | 'admin' | 'edit' | 'view';

export async function getDashboardAccess({
  userId,
  dashboardId,
}: {
  userId: string;
  dashboardId: string;
}): Promise<{
  role: DashboardRole;
  projectId: string;
  organizationId: string;
} | null> {
  const dashboard = await db.dashboard.findUnique({
    where: { id: dashboardId },
    select: { projectId: true, organizationId: true, createdById: true },
  });

  if (!dashboard) {
    return null;
  }

  const projectAccess = await getProjectAccess({
    userId,
    projectId: dashboard.projectId,
  });

  if (!projectAccess) {
    return null;
  }

  const base = {
    projectId: dashboard.projectId,
    organizationId: dashboard.organizationId,
  };

  if (dashboard.createdById === userId) {
    return { ...base, role: 'owner' };
  }

  const member = await getOrganizationAccess({
    userId,
    organizationId: dashboard.organizationId,
  });

  if (member?.role === 'org:admin') {
    return { ...base, role: 'admin' };
  }

  const access = await db.dashboardAccess.findUnique({
    where: { dashboardId_userId: { dashboardId, userId } },
  });

  if (access) {
    return { ...base, role: access.level };
  }

  return null;
}

export async function getClientAccess({
  userId,
  clientId,
}: {
  userId: string;
  clientId: string;
}) {
  const client = await db.client.findFirst({
    where: {
      id: clientId,
    },
  });

  if (!client) {
    return false;
  }

  if (client.projectId) {
    return getProjectAccess({ userId, projectId: client.projectId });
  }

  if (client.organizationId) {
    return getOrganizationAccess({
      userId,
      organizationId: client.organizationId,
    });
  }

  return false;
}
