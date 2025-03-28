import { logger } from '@/utils/logger';
import { generateSalt } from '@openpanel/common/server';
import { TABLE_NAMES, ch, chQuery, db } from '@openpanel/db';
import { escape } from 'sqlstring';

export async function deleteProjects() {
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

  if (process.env.SELF_HOSTED) {
    await ch.command({
      query: `DELETE FROM ${TABLE_NAMES.events} WHERE project_id IN (${projects.map((project) => escape(project.id)).join(',')});`,
      clickhouse_settings: {
        lightweight_deletes_sync: 0,
      },
    });
  } else {
    await ch.command({
      query: `DELETE FROM ${TABLE_NAMES.events}_replicated ON CLUSTER '{cluster}' WHERE project_id IN (${projects.map((project) => escape(project.id)).join(',')});`,
      clickhouse_settings: {
        lightweight_deletes_sync: 0,
      },
    });
  }

  logger.info(`Deleted ${projects.length} projects`, {
    projects,
  });
}
