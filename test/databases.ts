/**
 * Connection details for the suite's ISOLATED databases: tests never touch the application's own databases, whose
 * fixture teardown (`DELETE FROM events WHERE project_id = ...`) would mutate real data and, on a large table, outlast a
 * test timeout. Every test connection string derives from here; nothing in test/ may hard-code a database name.
 */

const POSTGRES_ORIGIN = 'postgresql://postgres:postgres@localhost:23432';
const CLICKHOUSE_ORIGIN = 'http://localhost:23123';

const SHARED_TEST_DATABASE = 'openpanel_test';
const WORKTREE_APP_DATABASE = /^openpanel_(\w+)$/;

/**
 * A worktree's app database is `openpanel_<name>`; its tests get `openpanel_test_<name>`, so one branch's migrations
 * never reach another branch's test runs. The main checkout and CI share `openpanel_test`. Already-pinned test names
 * are kept, so evaluating this after a preload has rewritten `DATABASE_URL` gives the same answer.
 */
function testDatabaseName(appDatabaseUrl: string | undefined): string {
  const appDatabase = appDatabaseUrl
    ? new URL(appDatabaseUrl).pathname.slice(1)
    : '';
  if (appDatabase.startsWith(SHARED_TEST_DATABASE)) {
    return appDatabase;
  }
  const worktree = WORKTREE_APP_DATABASE.exec(appDatabase)?.[1];
  return worktree
    ? `${SHARED_TEST_DATABASE}_${worktree}`
    : SHARED_TEST_DATABASE;
}

export const TEST_POSTGRES_DATABASE = testDatabaseName(
  process.env.DATABASE_URL
);
export const TEST_CLICKHOUSE_DATABASE = TEST_POSTGRES_DATABASE;

/** `CREATE DATABASE` cannot be issued from inside the database it creates. */
export const POSTGRES_MAINTENANCE_DATABASE = 'postgres';

export const postgresUrl = (database: string) =>
  `${POSTGRES_ORIGIN}/${database}?schema=public`;

export const clickhouseUrl = (database: string) =>
  `${CLICKHOUSE_ORIGIN}/${database}`;

export const TEST_DATABASE_URL = postgresUrl(TEST_POSTGRES_DATABASE);
export const POSTGRES_MAINTENANCE_URL = postgresUrl(
  POSTGRES_MAINTENANCE_DATABASE
);
export const TEST_CLICKHOUSE_URL = clickhouseUrl(TEST_CLICKHOUSE_DATABASE);

/** Redis is deliberately NOT isolated: it holds no production copy, so it carries neither hazard this module removes. */
export const TEST_REDIS_URL = 'redis://localhost:23379';
