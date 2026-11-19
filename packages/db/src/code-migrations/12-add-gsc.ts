import {
  createTable,
  runClickhouseMigrationCommands,
} from '../clickhouse/migration';
import { type CodeMigrationEnv, getIsCluster, writeSqlDump } from './helpers';

export async function up(env: CodeMigrationEnv) {
  const isClustered = getIsCluster(env);

  const commonMetricColumns = [
    '`clicks` UInt32 CODEC(Delta(4), LZ4)',
    '`impressions` UInt32 CODEC(Delta(4), LZ4)',
    '`ctr` Float32 CODEC(Gorilla, LZ4)',
    '`position` Float32 CODEC(Gorilla, LZ4)',
    '`synced_at` DateTime DEFAULT now() CODEC(Delta(4), LZ4)',
  ];

  const sqls: string[] = [
    // Daily totals — accurate overview numbers
    ...createTable({
      name: 'gsc_daily',
      columns: [
        '`project_id` String CODEC(ZSTD(3))',
        '`date` Date CODEC(Delta(2), LZ4)',
        ...commonMetricColumns,
      ],
      orderBy: ['project_id', 'date'],
      partitionBy: 'toYYYYMM(date)',
      engine: 'ReplacingMergeTree(synced_at)',
      distributionHash: 'cityHash64(project_id)',
      replicatedVersion: '1',
      isClustered,
    }),

    ...createTable({
      name: 'gsc_pages_daily',
      columns: [
        '`project_id` String CODEC(ZSTD(3))',
        '`date` Date CODEC(Delta(2), LZ4)',
        '`page` String CODEC(ZSTD(3))',
        ...commonMetricColumns,
      ],
      orderBy: ['project_id', 'date', 'page'],
      partitionBy: 'toYYYYMM(date)',
      engine: 'ReplacingMergeTree(synced_at)',
      distributionHash: 'cityHash64(project_id)',
      replicatedVersion: '1',
      isClustered,
    }),

    ...createTable({
      name: 'gsc_queries_daily',
      columns: [
        '`project_id` String CODEC(ZSTD(3))',
        '`date` Date CODEC(Delta(2), LZ4)',
        '`query` String CODEC(ZSTD(3))',
        ...commonMetricColumns,
      ],
      orderBy: ['project_id', 'date', 'query'],
      partitionBy: 'toYYYYMM(date)',
      engine: 'ReplacingMergeTree(synced_at)',
      distributionHash: 'cityHash64(project_id)',
      replicatedVersion: '1',
      isClustered,
    }),
  ];

  writeSqlDump(import.meta.url, sqls);

  if (!process.argv.includes('--dry')) {
    await runClickhouseMigrationCommands(sqls);
  }
}
