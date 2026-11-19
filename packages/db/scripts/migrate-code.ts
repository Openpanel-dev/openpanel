// Reads the environment and hands it to the runner, so no migration file
// touches `process.env`.

import type { CodeMigrationEnv } from '../src/code-migrations/helpers';
import { runCodeMigrations } from '../src/code-migrations/migrate';

const TRUE_VALUES = new Set(['true', '1']);

function isEnabled(value: string | undefined): boolean {
  return value !== undefined && TRUE_VALUES.has(value.trim());
}

const env: CodeMigrationEnv = {
  clickhouseCluster: isEnabled(process.env.CLICKHOUSE_CLUSTER),
  selfHosted: isEnabled(process.env.SELF_HOSTED),
  databaseUrl: process.env.DATABASE_URL,
  clickhouseUrl: process.env.CLICKHOUSE_URL,
};

await runCodeMigrations(env);
