import { TABLE_NAMES } from '../clickhouse/client';
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
      orderBy: ['project_id', 'session_id', 'started_at', 'chunk_index'],
      partitionBy: 'toYYYYMMDD(started_at)',
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

  writeSqlDump(import.meta.url, sqls);

  if (!process.argv.includes('--dry')) {
    await runClickhouseMigrationCommands(sqls);
  }
}
