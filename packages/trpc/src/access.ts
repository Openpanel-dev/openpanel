import { clerkClient } from '@clerk/fastify';

import { db, getProjectById } from '@openpanel/db';
import { cacheable } from '@openpanel/redis';

export const getProjectAccessCached = cacheable(getProjectAccess, 60 * 60);
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
    if (!project?.organizationSlug) {
      return false;
    }

    const member = await db.member.findFirst({
      where: {
        organizationId: project.organizationSlug,
        userId,
      },
    });

    return member;
  } catch (err) {
    return false;
  }
}

export const getOrganizationAccessCached = cacheable(
  getOrganizationAccess,
  60 * 60
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
