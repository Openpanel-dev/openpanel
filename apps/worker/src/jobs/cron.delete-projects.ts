import { logger } from '@/utils/logger';
import { TABLE_NAMES, ch, db } from '@openpanel/db';
import type { CronQueuePayload } from '@openpanel/queue';
import type { Job } from 'bullmq';
import { escape } from 'sqlstring';

export async function deleteProjects(job: Job<CronQueuePayload>) {
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

  for (const project of projects) {
    await db.project.delete({
      where: {
        id: project.id,
      },
    });
  }

  logger.info('Deleting projects', {
    projects,
  });

  projects.forEach((project) => {
    job.log(`Delete project: "${project.id}"`);
  });

  const where = `project_id IN (${projects.map((project) => escape(project.id)).join(',')})`;
  const tables = [
    TABLE_NAMES.events,
    TABLE_NAMES.profiles,
    TABLE_NAMES.events_bots,
    TABLE_NAMES.sessions,
    TABLE_NAMES.cohort_events_mv,
    TABLE_NAMES.dau_mv,
    TABLE_NAMES.event_names_mv,
    TABLE_NAMES.event_property_values_mv,
  ];

  for (const table of tables) {
    const query =
      process.env.NEXT_PUBLIC_SELF_HOSTED === 'true'
        ? `ALTER TABLE ${table} DELETE WHERE ${where};`
        : `ALTER TABLE ${table}_replicated ON CLUSTER '{cluster}' DELETE WHERE ${where};`;

    await ch.command({
      query,
      clickhouse_settings: {
        lightweight_deletes_sync: 0,
      },
    });
  }

  logger.info(`Deleted ${projects.length} projects`, {
    projects,
  });
}
