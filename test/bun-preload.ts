/**
 * `bun test` preload for `packages/db` and `apps/api` — the successor to
 * `test/global-setup.ts`, which vitest ran once per run and bun has no
 * equivalent for.
 *
 * Two jobs, in this order:
 *
 * 1. **Pin the infrastructure URLs at the ISOLATED test databases**
 *    (TESTFIX-001). This is a safety property, not a convenience: no test may
 *    reach the application's own `openpanel` databases, which on this box hold
 *    a copy of production — fixture teardown there mutates the dataset the
 *    migration goldens are diffed against, and a delete against a 318M-row
 *    table does not finish inside a test timeout. `test/databases.ts` is the
 *    single source of truth for the strings.
 * 2. **Bootstrap those databases and load the shared fixture**, tearing it
 *    down again when the file's tests finish.
 *
 * `preload` runs once per test FILE under `--isolate` (measured on Bun 1.4.0:
 * 4 files, 4 preloads, one pid, strictly sequential — and neither `globalThis`
 * nor `process.env` survives between them, so there is no in-process channel
 * to dedupe through). Everything here is therefore written to be idempotent
 * and is serialised by that sequencing: `bootstrapTestDatabases` is idempotent
 * by construction, and setup/teardown are paired around a single file's tests
 * so no file can observe another's teardown.
 *
 * The imports below are deliberately dynamic and deliberately below the env
 * pins: `packages/db`'s ClickHouse module constructs its clients at import
 * time, so a static import would capture the pre-pin `CLICKHOUSE_URL`.
 */

import { afterAll } from 'bun:test';
import {
  TEST_CLICKHOUSE_URL,
  TEST_DATABASE_URL,
  TEST_REDIS_URL,
} from './databases';

export const TEST_PROJECT_ID = 'integration-test';
export const TEST_ORG_ID = 'integration-org';

/**
 * Called twice, exactly as `test/global-setup.ts` called it in both `setup`
 * and `teardown`. The second call is not redundant: a test file may rewrite
 * `CLICKHOUSE_URL` for its own purposes — `sql.round-robin.clickhouse.test.ts`
 * points it at a dead node first, on purpose — and the fixture helpers read
 * the variable at call time, so teardown must re-pin before it deletes rows.
 */
function pinTestDatabases() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.CLICKHOUSE_URL = TEST_CLICKHOUSE_URL;
  process.env.REDIS_URL = TEST_REDIS_URL;
  process.env.SELF_HOSTED = 'true';
}

pinTestDatabases();

const { bootstrapTestDatabases } = await import('./bootstrap-databases');
const {
  setupFixtures,
  setupPostgresFixtures,
  teardownFixtures,
  teardownPostgresFixtures,
} = await import('./fixtures');

await bootstrapTestDatabases();
await setupPostgresFixtures(TEST_PROJECT_ID, TEST_ORG_ID);
await setupFixtures(TEST_PROJECT_ID);

afterAll(async () => {
  pinTestDatabases();
  await teardownFixtures(TEST_PROJECT_ID);
  await teardownPostgresFixtures(TEST_PROJECT_ID, TEST_ORG_ID);
});
