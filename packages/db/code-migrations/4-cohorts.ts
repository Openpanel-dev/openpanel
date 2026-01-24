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

  // 1. Create cohort_members table
  // Stores which profile_ids belong to which cohorts
  // Uses ReplacingMergeTree for efficient updates (version-based deduplication)
  if (!existingTables.includes('cohort_members_distributed') && !existingTables.includes('cohort_members')) {
    sqls.push(
      ...createTable({
        name: 'cohort_members',
        columns: [
          'project_id String CODEC(ZSTD(3))',
          'cohort_id String CODEC(ZSTD(3))',
          'profile_id String CODEC(ZSTD(3))',
          'matched_at DateTime DEFAULT now()',
          'matching_properties Map(String, String) CODEC(ZSTD(3))',
          'version UInt64 DEFAULT 1',
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

  // 2. Create cohort_metadata table
  // Caches cohort sizes and sample profile IDs for fast lookups
  if (!existingTables.includes('cohort_metadata_distributed') && !existingTables.includes('cohort_metadata')) {
    sqls.push(
      ...createTable({
        name: 'cohort_metadata',
        columns: [
          'project_id String',
          'cohort_id String',
          'member_count UInt64',
          'last_computed_at DateTime',
          'sample_profiles Array(String)',
          'version UInt64 DEFAULT 1',
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

  // 3. Create profile_event_summary_mv materialized view
  // Aggregates events by profile for fast cohort queries
  // NOTE: This is different from cohort_events_mv (which is used for retention analysis)
  // This MV is specifically for cohort computation with frequency filters
  // populate: false - will build incrementally from new events to avoid OOM
  if (!existingTables.includes('profile_event_summary_mv_distributed') && !existingTables.includes('profile_event_summary_mv')) {
    sqls.push(
      ...createMaterializedView({
        name: 'profile_event_summary_mv',
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
        populate: false, // Don't populate historical data - build incrementally
      }),
    );
  }

  await runClickhouseMigrationCommands(sqls);
}

export async function down() {
  // Down migration is not typically used in production
  // But included for development/testing rollback
  const isClustered = getIsCluster();

  const sqls = [
    dropTable('profile_event_summary_mv_distributed', isClustered),
    dropTable('profile_event_summary_mv_replicated', isClustered),
    dropTable('profile_event_summary_mv', isClustered),
    dropTable('cohort_metadata_distributed', isClustered),
    dropTable('cohort_metadata_replicated', isClustered),
    dropTable('cohort_metadata', isClustered),
    dropTable('cohort_members_distributed', isClustered),
    dropTable('cohort_members_replicated', isClustered),
    dropTable('cohort_members', isClustered),
  ];

  await runClickhouseMigrationCommands(sqls);
}
