import { db, getProjectById } from '@openpanel/db';
import { cacheable } from '@openpanel/redis';

export const getProjectAccessCached = cacheable(getProjectAccess, 60 * 5);
export async function getProjectAccess({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}) {
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
}

export const getOrganizationAccessCached = cacheable(
  getOrganizationAccess,
  60 * 5,
);
export async function getOrganizationAccess({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  return db.member.findFirst({
    where: {
      userId,
      organizationId,
    },
  });
}

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
