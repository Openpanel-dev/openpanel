// The shell for `src/code-migrations`. It reads the environment, the runner
// does the work — the same split `apps/api/src/main.ts` and `config/env.ts`
// have, and what keeps `packages/core/src` free of `process.env` (ADR-022 R7).
//
// `code-migrations` is not a conformance target (ADR-022, Carl's rulings): it
// runs as a script with direct database access and no services, and it leaves
// core for `packages/db` in its own task. This file is the seam that makes it
// runnable without a `process.env` read inside `src/`.

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
