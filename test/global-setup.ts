import { bootstrapTestDatabases } from './bootstrap-databases';
import { TEST_CLICKHOUSE_URL, TEST_DATABASE_URL } from './databases';
import {
  setupFixtures,
  setupPostgresFixtures,
  teardownFixtures,
  teardownPostgresFixtures,
} from './fixtures';

export { FIXTURE } from './fixtures';
export const TEST_PROJECT_ID = 'integration-test';
export const TEST_ORG_ID = 'integration-org';

// globalSetup runs in the parent process before vitest workers start,
// so vitest's `env` config is not applied — set the same pins explicitly.
function pinTestDatabases() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.CLICKHOUSE_URL = TEST_CLICKHOUSE_URL;
}

export async function setup() {
  pinTestDatabases();
  await bootstrapTestDatabases();
  await setupPostgresFixtures(TEST_PROJECT_ID, TEST_ORG_ID);
  await setupFixtures(TEST_PROJECT_ID);
}

export async function teardown() {
  pinTestDatabases();
  await teardownFixtures(TEST_PROJECT_ID);
  await teardownPostgresFixtures(TEST_PROJECT_ID, TEST_ORG_ID);
}
