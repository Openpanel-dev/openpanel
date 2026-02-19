import fs from 'node:fs';
import path from 'node:path';
import { TABLE_NAMES } from '../src/clickhouse/client';
import {
  addColumns,
  createTable,
  modifyTTL,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

export async function up() {
  const isClustered = getIsCluster();

  const sqls: string[] = [
    ...createTable({
      name: TABLE_NAMES.session_replay_chunks,
      columns: [
        '`project_id` String CODEC(ZSTD(3))',
        '`session_id` String CODEC(ZSTD(3))',
        '`chunk_index` UInt16',
        '`started_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3))',
        '`ended_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3))',
        '`events_count` UInt16',
        '`is_full_snapshot` Bool',
        '`payload` String CODEC(ZSTD(6))',
      ],
      orderBy: ['project_id', 'session_id', 'chunk_index'],
      partitionBy: 'toYYYYMM(started_at)',
      settings: {
        index_granularity: 8192,
      },
      distributionHash: 'cityHash64(project_id, session_id)',
      replicatedVersion: '1',
      isClustered,
    }),
    modifyTTL({
      tableName: TABLE_NAMES.session_replay_chunks,
      isClustered,
      ttl: 'started_at + INTERVAL 30 DAY',
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
