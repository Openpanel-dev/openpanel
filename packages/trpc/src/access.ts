import { db, getProjectById } from '@openpanel/db';
import { cacheable } from '@openpanel/redis';

export const getProjectAccess = cacheable(
  'getProjectAccess',
  async ({
    userId,
    projectId,
  }: {
    userId: string;
    projectId: string;
  }) => {
    try {
      // Check if user has access to the project
      const project = await getProjectById(projectId);
      if (!project?.organizationId) {
        return false;
      }

      const [projectAccess, member] = await Promise.all([
        db.$primary().projectAccess.findMany({
          where: {
            userId,
            organizationId: project.organizationId,
          },
        }),
        db.$primary().member.findFirst({
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
  60 * 5,
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
    return db.$primary().member.findFirst({
      where: {
        userId,
        organizationId,
      },
    });
  },
  60 * 5,
);

export const getClientAccessCached = cacheable(getClientAccess, 60 * 5);
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
