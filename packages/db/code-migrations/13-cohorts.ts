import fs from 'node:fs';
import path from 'node:path';
import { TABLE_NAMES } from '../src/clickhouse/client';
import {
  createMaterializedView,
  createTable,
  dropTable,
  getExistingTables,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

export async function up() {
  const replicatedVersion = '1';
  const existingTables = await getExistingTables();
  const isClustered = getIsCluster();

  const sqls: string[] = [];

  // 1. cohort_members — which profile_ids belong to which cohorts.
  //    ReplacingMergeTree(version) = newer compute wins on merge.
  if (
    !existingTables.includes(`${TABLE_NAMES.cohort_members}_distributed`) &&
    !existingTables.includes(TABLE_NAMES.cohort_members)
  ) {
    sqls.push(
      ...createTable({
        name: TABLE_NAMES.cohort_members,
        columns: [
          '`project_id` String CODEC(ZSTD(3))',
          '`cohort_id` String CODEC(ZSTD(3))',
          '`profile_id` String CODEC(ZSTD(3))',
          '`matched_at` DateTime DEFAULT now()',
          '`matching_properties` Map(String, String) CODEC(ZSTD(3))',
          '`version` UInt64 DEFAULT 1',
        ],
        indices: [
          'INDEX idx_profile profile_id TYPE bloom_filter GRANULARITY 1',
          'INDEX idx_cohort cohort_id TYPE bloom_filter GRANULARITY 1',
        ],
        engine: 'ReplacingMergeTree(version)',
        orderBy: ['project_id', 'cohort_id', 'profile_id'],
        partitionBy: 'toYYYYMM(matched_at)',
        settings: {
          index_granularity: 8192,
        },
        distributionHash: 'cityHash64(project_id, cohort_id)',
        replicatedVersion,
        isClustered,
      }),
    );
  }

  // 2. cohort_metadata — cached member count + sample profiles per cohort.
  if (
    !existingTables.includes(`${TABLE_NAMES.cohort_metadata}_distributed`) &&
    !existingTables.includes(TABLE_NAMES.cohort_metadata)
  ) {
    sqls.push(
      ...createTable({
        name: TABLE_NAMES.cohort_metadata,
        columns: [
          '`project_id` String',
          '`cohort_id` String',
          '`member_count` UInt64',
          '`last_computed_at` DateTime',
          '`sample_profiles` Array(String)',
          '`version` UInt64 DEFAULT 1',
        ],
        engine: 'ReplacingMergeTree(version)',
        orderBy: ['project_id', 'cohort_id'],
        settings: {
          index_granularity: 8192,
        },
        distributionHash: 'cityHash64(project_id, cohort_id)',
        replicatedVersion,
        isClustered,
      }),
    );
  }

  // 3. profile_event_summary_mv — aggregates events per (profile, event, day).
  //    Used by cohort compute when frequency filters are present.
  //    populate: false — we have a cluster with lots of events; backfill ad-hoc.
  if (
    !existingTables.includes(
      `${TABLE_NAMES.profile_event_summary_mv}_distributed`,
    ) &&
    !existingTables.includes(TABLE_NAMES.profile_event_summary_mv)
  ) {
    sqls.push(
      ...createMaterializedView({
        name: TABLE_NAMES.profile_event_summary_mv,
        tableName: 'events',
        engine: 'AggregatingMergeTree()',
        orderBy: ['project_id', 'profile_id', 'name', 'event_date'],
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
    dropTable(`${TABLE_NAMES.profile_event_summary_mv}_distributed`, isClustered),
    dropTable(`${TABLE_NAMES.profile_event_summary_mv}_replicated`, isClustered),
    dropTable(TABLE_NAMES.profile_event_summary_mv, isClustered),
    dropTable(`${TABLE_NAMES.cohort_metadata}_distributed`, isClustered),
    dropTable(`${TABLE_NAMES.cohort_metadata}_replicated`, isClustered),
    dropTable(TABLE_NAMES.cohort_metadata, isClustered),
    dropTable(`${TABLE_NAMES.cohort_members}_distributed`, isClustered),
    dropTable(`${TABLE_NAMES.cohort_members}_replicated`, isClustered),
    dropTable(TABLE_NAMES.cohort_members, isClustered),
  ];

  await runClickhouseMigrationCommands(sqls);
}
