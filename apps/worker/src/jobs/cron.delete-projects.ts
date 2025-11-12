import { logger } from '@/utils/logger';
import { db, deleteFromClickhouse, deleteProjects } from '@openpanel/db';
import type { CronQueuePayload } from '@openpanel/queue';
import type { Job } from 'bullmq';

export async function jobdeleteProjects(job: Job<CronQueuePayload>) {
  const projects = await db.project.findMany({
    where: {
      deleteAt: {
        lte: new Date(),
      },
    },
  });

  if (projects.length === 0) {
    return;
  }

  await deleteProjects(projects.map((project) => project.id));

  logger.info('Deleting projects', {
    projects,
  });

  await deleteFromClickhouse(projects.map((project) => project.id));

  logger.info(`Deleted ${projects.length} projects`, {
    projects,
  });
}
