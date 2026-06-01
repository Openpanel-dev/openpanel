import {
  db,
  deleteFromClickhouse,
  deleteOrganization,
  deleteProjects,
} from '@openpanel/db';
import { logger } from '@/utils/logger';

export async function jobDelete() {
  const now = new Date();

  // Find orphaned organizations (no admin member)
  // or organizations that are scheduled for deletion
  const organizations = await db.organization.findMany({
    where: {
      OR: [
        { deleteAt: { lte: now } },
        { members: { none: { role: 'org:admin' } } },
      ],
    },
    include: { projects: { select: { id: true } } },
  });

  // Skip paying organizations
  const deletableOrganizations = organizations.filter(
    (organization) =>
      !(organization.hasSubscription && !organization.isWillBeCanceled)
  );

  // Find projects that are scheduled for deletion
  const scheduledProjects = await db.project.findMany({
    where: { deleteAt: { lte: now } },
    select: { id: true },
  });

  const projectIds = [
    ...new Set([
      ...deletableOrganizations.flatMap((organization) =>
        organization.projects.map((project) => project.id)
      ),
      ...scheduledProjects.map((project) => project.id),
    ]),
  ];

  if (projectIds.length > 0) {
    await deleteFromClickhouse(projectIds);
    await deleteProjects(projectIds);
  }

  for (const organization of deletableOrganizations) {
    await deleteOrganization(organization.id);
  }

  logger.info(
    {
      organizations: deletableOrganizations.length,
      projects: projectIds.length,
    },
    'Delete cron complete'
  );
}
