import {
  addColumns,
  runClickhouseMigrationCommands,
} from '../clickhouse/migration';
import { type CodeMigrationEnv, getIsCluster, writeSqlDump } from './helpers';

export async function up(env: CodeMigrationEnv) {
  const isClustered = getIsCluster(env);

  const sqls: string[] = [
    ...addColumns(
      'events',
      ['`revenue` UInt64 AFTER `referrer_type`'],
      isClustered
    ),
  ];

  writeSqlDump(import.meta.url, sqls);

  if (!process.argv.includes('--dry')) {
    await runClickhouseMigrationCommands(sqls);
  }
}
