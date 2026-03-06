import fs from 'node:fs';
import path from 'node:path';
import { createTable, runClickhouseMigrationCommands } from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

export async function up() {
  const isClustered = getIsCluster();

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

    // Per-page breakdown
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

    // Per-query breakdown
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
