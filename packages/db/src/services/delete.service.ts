import { TABLE_NAMES, ch, getReplicatedTableName } from '../clickhouse/client';
import { logger } from '../logger';
import { db } from '../prisma-client';

import sqlstring from 'sqlstring';

export async function deleteOrganization(organizationId: string) {
  return await db.organization.delete({
    where: {
      id: organizationId,
    },
  });
}

export async function deleteProjects(projectIds: string[]) {
  const projects = await db.project.findMany({
    where: {
      id: {
        in: projectIds,
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

  return projects;
}

export async function deleteFromClickhouse(projectIds: string[]) {
  const where = `project_id IN (${projectIds.map((projectId) => sqlstring.escape(projectId)).join(',')})`;
  const tables = [
    TABLE_NAMES.events,
    TABLE_NAMES.profiles,
    TABLE_NAMES.events_bots,
    TABLE_NAMES.sessions,
    TABLE_NAMES.cohort_events_mv,
    TABLE_NAMES.dau_mv,
    TABLE_NAMES.event_names_mv,
    TABLE_NAMES.event_property_values_mv,
    TABLE_NAMES.cohort_members,
    TABLE_NAMES.cohort_metadata,
    TABLE_NAMES.profile_event_summary_mv,
    TABLE_NAMES.profile_event_property_summary_mv,
  ];

  for (const table of tables) {
    // If materialized view, use ALTER TABLE since DELETE is not supported
    const query = table.endsWith('_mv')
      ? `ALTER TABLE ${getReplicatedTableName(table)} DELETE WHERE ${where};`
      : `DELETE FROM ${getReplicatedTableName(table)} WHERE ${where};`;

    logger.info({ query }, 'Deleting from ClickHouse table:');
    await ch.command({
      query,
      clickhouse_settings: {
        lightweight_deletes_sync: '0',
      },
    });
  }
}
