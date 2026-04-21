import fs from 'node:fs';
import path from 'node:path';
import { TABLE_NAMES } from '../src/clickhouse/client';
import {
  createMaterializedView,
  dropTable,
  getExistingTables,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

// Per-property breakdown of profile events, used when cohort event criteria
// filter on properties.<key> AND as a future fast path for property breakdowns
// in chart queries. populate: false — backfill ad-hoc.
//
// NOTE: fork references this MV but never shipped a migration for it; we own
// the authoritative DDL.
export async function up() {
  const replicatedVersion = '1';
  const existingTables = await getExistingTables();
  const isClustered = getIsCluster();

  const sqls: string[] = [];

  if (
    !existingTables.includes(
      `${TABLE_NAMES.profile_event_property_summary_mv}_distributed`,
    ) &&
    !existingTables.includes(TABLE_NAMES.profile_event_property_summary_mv)
  ) {
    sqls.push(
      ...createMaterializedView({
        name: TABLE_NAMES.profile_event_property_summary_mv,
        tableName: 'events',
        engine: 'AggregatingMergeTree()',
        orderBy: [
          'project_id',
          'profile_id',
          'name',
          'property_key',
          'event_date',
        ],
        partitionBy: 'toYYYYMM(event_date)',
        query: `SELECT
          project_id,
          profile_id,
          name,
          property_key,
          property_value,
          toStartOfDay(created_at) AS event_date,
          countState() AS event_count,
          minState(created_at) AS first_event_time,
          maxState(created_at) AS last_event_time
        FROM {events}
        ARRAY JOIN mapKeys(properties) AS property_key, mapValues(properties) AS property_value
        WHERE profile_id != device_id
          AND property_key != ''
          AND property_value != ''
        GROUP BY project_id, profile_id, name, property_key, property_value, event_date`,
        distributionHash: 'cityHash64(project_id, profile_id)',
        replicatedVersion,
        isClustered,
        populate: false,
      }),
    );
  }

  fs.writeFileSync(
    path.join(import.meta.filename.replace('.ts', '.sql')),
    sqls
      .map((sql) =>
        sql
          .trim()
          .replace(/;$/, '')
          .replace(/\n{2,}/g, '\n')
          .concat(';'),
      )
      .join('\n\n---\n\n'),
  );

  if (!process.argv.includes('--dry')) {
    await runClickhouseMigrationCommands(sqls);
  }
}

export async function down() {
  const isClustered = getIsCluster();

  const sqls = [
    dropTable(
      `${TABLE_NAMES.profile_event_property_summary_mv}_distributed`,
      isClustered,
    ),
    dropTable(
      `${TABLE_NAMES.profile_event_property_summary_mv}_replicated`,
      isClustered,
    ),
    dropTable(TABLE_NAMES.profile_event_property_summary_mv, isClustered),
  ];

  await runClickhouseMigrationCommands(sqls);
}
