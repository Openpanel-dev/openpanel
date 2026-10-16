/**
 * `bun test` preload for `packages/db` and `apps/api`.
 *
 * 1. Pin the infrastructure URLs at the ISOLATED test databases (`test/databases.ts`): no test may reach the
 *    application's own `openpanel` databases, where fixture teardown would mutate real data.
 * 2. Bootstrap those databases and load the shared fixture, tearing it down when the file's tests finish.
 *
 * `preload` runs once per test FILE under `--isolate`; neither `globalThis` nor `process.env` survives between files,
 * so everything here is idempotent and setup/teardown are paired around one file's tests.
 *
 * The imports below are deliberately dynamic and below the env pins: `packages/db`'s ClickHouse module constructs its
 * clients at import time, so a static import would capture the pre-pin `CLICKHOUSE_URL`.
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
 * Called twice: once for setup, once for teardown. The second call is not
 * redundant: a test file may rewrite `CLICKHOUSE_URL` for its own purposes —
 * `sql.round-robin.clickhouse.test.ts` points it at a dead node first, on
 * purpose — and the fixture helpers read the variable at call time, so
 * teardown must re-pin before it deletes rows.
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
