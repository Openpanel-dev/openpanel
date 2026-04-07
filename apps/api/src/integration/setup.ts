import { setupFixtures, teardownFixtures } from '../../../../test/clickhouse-fixtures';

export { FIXTURE } from '../../../../test/clickhouse-fixtures';

export const TEST_PROJECT_ID = 'api-e2e-test';
export const TEST_ORG_ID = 'api-e2e-org';

export const setup = () => setupFixtures(TEST_PROJECT_ID);
export const teardown = () => teardownFixtures(TEST_PROJECT_ID);
