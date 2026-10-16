import {
  createTable,
  modifyTTL,
  runClickhouseMigrationCommands,
} from '../clickhouse/migration';
import { type CodeMigrationEnv, getIsCluster, writeSqlDump } from './helpers';

export async function up(env: CodeMigrationEnv) {
  const isClustered = getIsCluster(env);

  const sqls: string[] = [
    ...createTable({
      name: 'events_imports',
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

        '`import_id` String CODEC(ZSTD(3))',
        "`import_status` LowCardinality(String) DEFAULT 'pending'",
        '`imported_at_meta` DateTime DEFAULT now()',
      ],
      orderBy: ['import_id', 'created_at'],
      partitionBy: 'toYYYYMM(imported_at_meta)',
      settings: {
        index_granularity: 8192,
      },
      distributionHash: 'cityHash64(import_id)',
      replicatedVersion: '1',
      isClustered,
    }),
  ];

  // Add TTL policy for auto-cleanup after 7 days
  sqls.push(
    modifyTTL({
      tableName: 'events_imports',
      isClustered,
      ttl: 'imported_at_meta + INTERVAL 7 DAY',
    })
  );

  writeSqlDump(import.meta.url, sqls);

  if (!process.argv.includes('--dry')) {
    await runClickhouseMigrationCommands(sqls);
  }
}
