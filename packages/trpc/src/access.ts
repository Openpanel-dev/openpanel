import { clerkClient } from '@clerk/fastify';

import { getProjectById } from '@openpanel/db';
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
    const [project, organizations] = await Promise.all([
      getProjectById(projectId),
      clerkClient.users.getOrganizationMembershipList({
        userId,
      }),
    ]);

    if (!project) {
      return false;
    }

    return !!organizations.data.find(
      (org) => org.organization.slug === project.organizationSlug
    );
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
  const organizations = await clerkClient.users.getOrganizationMembershipList({
    userId,
  });

  return !!organizations.data.find(
    (org) => org.organization.id === organizationId
  );
}
