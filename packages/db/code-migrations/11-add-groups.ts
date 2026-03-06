import fs from 'node:fs';
import path from 'node:path';
import { TABLE_NAMES } from '../src/clickhouse/client';
import {
  addColumns,
  createTable,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

export async function up() {
  const isClustered = getIsCluster();

  const sqls: string[] = [
    ...addColumns(
      'events',
      ['`groups` Array(String) DEFAULT [] CODEC(ZSTD(3)) AFTER session_id'],
      isClustered
    ),
    ...addColumns(
      'sessions',
      ['`groups` Array(String) DEFAULT [] CODEC(ZSTD(3)) AFTER device_id'],
      isClustered
    ),
    ...addColumns(
      'profiles',
      ['`groups` Array(String) DEFAULT [] CODEC(ZSTD(3)) AFTER project_id'],
      isClustered
    ),
    ...createTable({
      name: TABLE_NAMES.groups,
      columns: [
        '`id` String',
        '`project_id` String',
        '`type` String',
        '`name` String',
        '`properties` Map(String, String)',
        '`created_at` DateTime',
        '`version` UInt64',
        '`deleted` UInt8 DEFAULT 0',
      ],
      engine: 'ReplacingMergeTree(version, deleted)',
      orderBy: ['project_id', 'id'],
      distributionHash: 'cityHash64(project_id, id)',
      replicatedVersion: '1',
      isClustered,
    }),
  ];

  fs.writeFileSync(
    path.join(import.meta.filename.replace('.ts', '.sql')),
    sqls
      .map((sql) =>
        sql
          .trim()
          .replace(/;$/, '')
          .replace(/\n{2,}/g, '\n')
          .concat(';')
      )
      .join('\n\n---\n\n')
  );

  if (!process.argv.includes('--dry')) {
    await runClickhouseMigrationCommands(sqls);
  }
}
