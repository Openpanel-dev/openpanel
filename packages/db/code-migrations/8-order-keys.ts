import fs from 'node:fs';
import path from 'node:path';
import {
  chMigrationClient,
  createTable,
  moveDataBetweenTables,
  renameTable,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

/**
 * Migration to update ORDER BY keys for events and sessions tables.
 *
 * Changes:
 * - Events: Remove profile_id from ORDER BY, add created_at for better ordering
 *   Old: ['project_id', 'toDate(created_at)', 'profile_id', 'name']
 *   New: ['project_id', 'toDate(created_at)', 'created_at', 'name']
 *
 * - Sessions: Remove profile_id from ORDER BY, reorder to match query patterns
 *   Old: ['project_id', 'id', 'toDate(created_at)', 'profile_id']
 *   New: ['project_id', 'toDate(created_at)', 'created_at', 'id']
 *
 * Rationale:
 * - project_id: Always filtered first (100% of queries)
 * - toDate(created_at): Almost always filtered (95%+ of queries), good for partitioning
 * - created_at: Helps with ordering within same day, matches ORDER BY patterns in queries
 * - name (events): Frequently filtered (screen_view, session_start, etc.), good selectivity
 * - id (sessions): Used for ordering and uniqueness in session queries
 */
export async function up() {
  const isClustered = getIsCluster();

  const sqls: string[] = [];

  const eventTables = createTable({
    name: 'events_new_20251123',
    columns: [
      '`id` UUID DEFAULT generateUUIDv4()',
      '`name` LowCardinality(String)',
      '`sdk_name` LowCardinality(String)',
      '`sdk_version` LowCardinality(String)',
      '`device_id` String CODEC(ZSTD(3))',
      '`profile_id` String CODEC(ZSTD(3))',
      '`project_id` String CODEC(ZSTD(3))',
      '`session_id` String CODEC(LZ4)',
      '`path` String CODEC(ZSTD(3))',
      '`origin` String CODEC(ZSTD(3))',
      '`referrer` String CODEC(ZSTD(3))',
      '`referrer_name` String CODEC(ZSTD(3))',
      '`referrer_type` LowCardinality(String)',
      '`revenue` UInt64',
      '`duration` UInt64 CODEC(Delta(4), LZ4)',
      '`properties` Map(String, String) CODEC(ZSTD(3))',
      '`created_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3))',
      '`country` LowCardinality(FixedString(2))',
      '`city` String',
      '`region` LowCardinality(String)',
      '`longitude` Nullable(Float32) CODEC(Gorilla, LZ4)',
      '`latitude` Nullable(Float32) CODEC(Gorilla, LZ4)',
      '`os` LowCardinality(String)',
      '`os_version` LowCardinality(String)',
      '`browser` LowCardinality(String)',
      '`browser_version` LowCardinality(String)',
      '`device` LowCardinality(String)',
      '`brand` LowCardinality(String)',
      '`model` LowCardinality(String)',
      '`imported_at` Nullable(DateTime) CODEC(Delta(4), LZ4)',
    ],
    indices: [
      'INDEX idx_name name TYPE bloom_filter GRANULARITY 1',
      "INDEX idx_properties_bounce properties['__bounce'] TYPE set(3) GRANULARITY 1",
      'INDEX idx_origin origin TYPE bloom_filter(0.05) GRANULARITY 1',
      'INDEX idx_path path TYPE bloom_filter(0.01) GRANULARITY 1',
    ],
    // New ORDER BY: project_id, toDate(created_at), created_at, name
    // Removed profile_id, added created_at for better ordering within same day
    orderBy: ['project_id', 'toDate(created_at)', 'created_at', 'name'],
    partitionBy: 'toYYYYMM(created_at)',
    settings: {
      index_granularity: 8192,
      // For lightweight updates
      enable_block_offset_column: 1,
      enable_block_number_column: 1,
    },
    distributionHash:
      'cityHash64(project_id, toString(toStartOfHour(created_at)))',
    replicatedVersion: '1',
    isClustered,
  });

  // Step 1: Create temporary tables with new ORDER BY keys
  // Events table with new ORDER BY
  sqls.push(...eventTables);

  const sessionTables = createTable({
    name: 'sessions_new_20251123',
    engine: 'VersionedCollapsingMergeTree(sign, version)',
    columns: [
      '`id` String',
      '`project_id` String CODEC(ZSTD(3))',
      '`profile_id` String CODEC(ZSTD(3))',
      '`device_id` String CODEC(ZSTD(3))',
      '`created_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3))',
      '`ended_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3))',
      '`is_bounce` Bool',
      '`entry_origin` LowCardinality(String)',
      '`entry_path` String CODEC(ZSTD(3))',
      '`exit_origin` LowCardinality(String)',
      '`exit_path` String CODEC(ZSTD(3))',
      '`screen_view_count` Int32',
      '`revenue` Float64',
      '`event_count` Int32',
      '`duration` UInt32',
      '`country` LowCardinality(FixedString(2))',
      '`region` LowCardinality(String)',
      '`city` String',
      '`longitude` Nullable(Float32) CODEC(Gorilla, LZ4)',
      '`latitude` Nullable(Float32) CODEC(Gorilla, LZ4)',
      '`device` LowCardinality(String)',
      '`brand` LowCardinality(String)',
      '`model` LowCardinality(String)',
      '`browser` LowCardinality(String)',
      '`browser_version` LowCardinality(String)',
      '`os` LowCardinality(String)',
      '`os_version` LowCardinality(String)',
      '`utm_medium` String CODEC(ZSTD(3))',
      '`utm_source` String CODEC(ZSTD(3))',
      '`utm_campaign` String CODEC(ZSTD(3))',
      '`utm_content` String CODEC(ZSTD(3))',
      '`utm_term` String CODEC(ZSTD(3))',
      '`referrer` String CODEC(ZSTD(3))',
      '`referrer_name` String CODEC(ZSTD(3))',
      '`referrer_type` LowCardinality(String)',
      '`sign` Int8',
      '`version` UInt64',
      '`properties` Map(String, String) CODEC(ZSTD(3))',
    ],
    // New ORDER BY: project_id, toDate(created_at), created_at, id
    // Removed profile_id, reordered to match query patterns (date first, then id)
    orderBy: ['project_id', 'toDate(created_at)', 'created_at'],
    partitionBy: 'toYYYYMM(created_at)',
    settings: {
      index_granularity: 8192,
    },
    distributionHash:
      'cityHash64(project_id, toString(toStartOfHour(created_at)))',
    replicatedVersion: '1',
    isClustered,
  });

  // Sessions table with new ORDER BY
  sqls.push(...sessionTables);

  const firstEventDateResponse = await chMigrationClient.query({
    query: 'SELECT min(created_at) as created_at FROM events',
    format: 'JSONEachRow',
  });
  const firstEventDateJson = await firstEventDateResponse.json<{
    created_at: string;
  }>();
  const firstEventDate = new Date(firstEventDateJson[0]?.created_at ?? '');
  if (firstEventDate) {
    // Step 2: Copy data from old tables to new tables (partitioned by month for efficiency)
    sqls.push(
      ...moveDataBetweenTables({
        from: 'events',
        to: 'events_new_20251123',
        batch: {
          startDate: firstEventDate,
          column: 'toDate(created_at)',
          interval: 'month',
          transform: (date: Date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            return `${year}-${month}-01`;
          },
        },
      }),
    );
  }

  const firstSessionDateResponse = await chMigrationClient.query({
    query: 'SELECT min(created_at) as created_at FROM sessions',
    format: 'JSONEachRow',
  });
  const firstSessionDateJson = await firstSessionDateResponse.json<{
    created_at: string;
  }>();

  const firstSessionDate = new Date(firstSessionDateJson[0]?.created_at ?? '');
  if (firstSessionDate) {
    sqls.push(
      ...moveDataBetweenTables({
        from: 'sessions',
        to: 'sessions_new_20251123',
        batch: {
          startDate: firstSessionDate,
          column: 'toDate(created_at)',
          interval: 'month',
          transform: (date: Date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            return `${year}-${month}-01`;
          },
        },
      }),
    );
  }

  sqls.push(
    ...renameTable({ from: 'events', to: 'events_20251123', isClustered }),
  );
  sqls.push(
    ...renameTable({ from: 'sessions', to: 'sessions_20251123', isClustered }),
  );

  if (isClustered && sessionTables[1] && eventTables[1]) {
    sqls.push(
      // Drop temporary DISTRIBUTED tables (will be recreated)
      'DROP TABLE IF EXISTS events_new_20251123 ON CLUSTER "{cluster}"',
      'DROP TABLE IF EXISTS sessions_new_20251123 ON CLUSTER "{cluster}"',
      // Rename new tables to correct names
      'RENAME TABLE events_new_20251123_replicated TO events_replicated ON CLUSTER "{cluster}"',
      'RENAME TABLE sessions_new_20251123_replicated TO sessions_replicated ON CLUSTER "{cluster}"',
      // Create new distributed tables
      eventTables[1].replaceAll('events_new_20251123', 'events'), // creates a new distributed table
      sessionTables[1].replaceAll('sessions_new_20251123', 'sessions'), // creates a new distributed table
    );
  } else {
    sqls.push(
      ...renameTable({
        from: 'events_new_20251123',
        to: 'events',
        isClustered,
      }),
    );
    sqls.push(
      ...renameTable({
        from: 'sessions_new_20251123',
        to: 'sessions',
        isClustered,
      }),
    );
  }

  fs.writeFileSync(
    path.join(__filename.replace('.ts', '.sql')),
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
