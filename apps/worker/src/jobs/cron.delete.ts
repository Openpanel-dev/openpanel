import {
  db,
  deleteFromClickhouse,
  deleteOrganization,
  deleteProjects,
} from '@openpanel/db';
import { logger } from '@/utils/logger';

export async function jobDelete() {
  const now = new Date();

  // Orgs to delete: explicitly scheduled OR ownerless (no org:admin member left).
  const organizations = await db.organization.findMany({
    where: {
      OR: [
        { deleteAt: { lte: now } },
        { members: { none: { role: 'org:admin' } } },
      ],
    },
    select: { id: true, name: true, projects: { select: { id: true } } },
  });
  const orgIds = organizations.map((organization) => organization.id);
  const orgProjectIds = organizations.flatMap((organization) =>
    organization.projects.map((project) => project.id),
  );

  // Standalone projects scheduled for deletion (skip ones already covered by an
  // org delete, since deleting the org cascades its projects in Postgres).
  const scheduledProjects = await db.project.findMany({
    where: {
      deleteAt: { lte: now },
      organizationId: { notIn: orgIds },
    },
    select: { id: true },
  });
  const standaloneProjectIds = scheduledProjects.map((project) => project.id);

  const allProjectIds = [...orgProjectIds, ...standaloneProjectIds];

  if (allProjectIds.length === 0 && organizations.length === 0) {
    return;
  }

  // ClickHouse first: Postgres cascades projects when an org is deleted, but the
  // ClickHouse events are not cascade-deleted, so they must be cleaned for every
  // project that is about to disappear.
  if (allProjectIds.length > 0) {
    await deleteFromClickhouse(allProjectIds);
  }

  if (standaloneProjectIds.length > 0) {
    await deleteProjects(standaloneProjectIds);
  }

  for (const organization of organizations) {
    await deleteOrganization(organization.id);
  }

  logger.info(
    { organizations: organizations.length, projects: allProjectIds.length },
    'Delete cron complete',
  );
}
