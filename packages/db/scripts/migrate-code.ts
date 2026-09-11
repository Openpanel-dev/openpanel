// The shell for `src/code-migrations`. It reads the environment, the runner
// does the work — the same split `apps/api/src/main.ts` and `config/env.ts`
// have, and what keeps every migration file free of `process.env`
// (ADR-022 R7, which travelled with the directory in M15-204).
//
// `code-migrations` is not a conformance target (ADR-022, Carl's rulings): it
// lives in @openpanel/db, runs as a script with direct database access and no
// services, and copies the vocabulary it needs from core rather than importing
// it — isolation beats reuse.

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
