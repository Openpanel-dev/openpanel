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
// so vitest's `env` config is not applied — set defaults explicitly.
function setEnvDefaults() {
  process.env.DATABASE_URL ??=
    'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';
  process.env.CLICKHOUSE_URL ??= 'http://localhost:8123/openpanel';
}

export async function setup() {
  setEnvDefaults();
  await setupPostgresFixtures(TEST_PROJECT_ID, TEST_ORG_ID);
  await setupFixtures(TEST_PROJECT_ID);
}

export async function teardown() {
  setEnvDefaults();
  await teardownFixtures(TEST_PROJECT_ID);
  await teardownPostgresFixtures(TEST_PROJECT_ID, TEST_ORG_ID);
}
