import fs from 'node:fs';
import path from 'node:path';
import { TABLE_NAMES } from '../src/clickhouse/client';
import {
  createMaterializedView,
  getExistingTables,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

/**
 * Re-key the cohort summary MVs for the queries that actually read them.
 *
 * profile_event_summary_mv is ordered (project_id, profile_id, name,
 * event_date), and the property variant similarly with property_key after
 * name. Cohort criteria filter on name, a date range and optionally a
 * property, then GROUP BY profile_id — they never filter profile_id. With
 * profile_id second, the usable key prefix ends at project_id, so every
 * criterion reads the project's entire slice of the MV however narrow the
 * criterion is. Cohorts run one such query per criterion, on a schedule.
 *
 * Measured on a ~100M-row summary MV: a criterion that can only prune on
 * project_id reads 103,985,861 rows (10.9s); the same criterion with name
 * and event_date in the key prefix reads 115,141 rows (0.11s).
 *
 * A sort key cannot be altered in place, so this creates replacement MVs
 * keyed for the consumer:
 *
 *   event_profile_summary_mv
 *     (project_id, name, event_date, profile_id)
 *   event_property_profile_summary_mv
 *     (project_id, name, property_key, property_value, event_date, profile_id)
 *
 * The SELECT bodies, the identity filter and the aggregate columns are
 * unchanged, so the new tables hold exactly the same rows as the old ones.
 * Only the physical order differs.
 *
 * populate: false — these index events inserted after CREATE. History is
 * filled by migration 21, which rebuilds them month by month from events.
 *
 * The old MVs are left in place and keep receiving inserts. Once the new
 * ones are verified, dropping them is a one-line follow-up migration.
 */
export async function up() {
  const replicatedVersion = '1';
  const existingTables = await getExistingTables();
  const isClustered = getIsCluster();
  const sqls: string[] = [];

  if (
    !existingTables.includes(
      `${TABLE_NAMES.event_profile_summary_mv}_distributed`,
    ) &&
    !existingTables.includes(TABLE_NAMES.event_profile_summary_mv)
  ) {
    sqls.push(
      ...createMaterializedView({
        name: TABLE_NAMES.event_profile_summary_mv,
        tableName: 'events',
        engine: 'AggregatingMergeTree()',
        orderBy: ['project_id', 'name', 'event_date', 'profile_id'],
        partitionBy: 'toYYYYMM(event_date)',
        query: `SELECT
          project_id,
          profile_id,
          name,
          toStartOfDay(created_at) AS event_date,
          countState() AS event_count,
          minState(created_at) AS first_event_time,
          maxState(created_at) AS last_event_time,
          sumState(duration) AS total_duration
        FROM {events}
        WHERE profile_id != device_id
        GROUP BY project_id, profile_id, name, event_date`,
        distributionHash: 'cityHash64(project_id, profile_id)',
        replicatedVersion,
        isClustered,
        populate: false,
      }),
    );
  }

  if (
    !existingTables.includes(
      `${TABLE_NAMES.event_property_profile_summary_mv}_distributed`,
    ) &&
    !existingTables.includes(TABLE_NAMES.event_property_profile_summary_mv)
  ) {
    sqls.push(
      ...createMaterializedView({
        name: TABLE_NAMES.event_property_profile_summary_mv,
        tableName: 'events',
        engine: 'AggregatingMergeTree()',
        orderBy: [
          'project_id',
          'name',
          'property_key',
          'property_value',
          'event_date',
          'profile_id',
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
      .map((sql) => sql.trim().replace(/;$/, '').replace(/\n{2,}/g, '\n').concat(';'))
      .join('\n\n---\n\n'),
  );

  if (process.argv.includes('--dry')) {
    console.log('🔍 DRY RUN — CREATE statements:');
    for (const sql of sqls) {
      console.log(`\n${sql}\n`);
    }
    return;
  }

  await runClickhouseMigrationCommands(sqls);
}
