/**
 * Connection details for the suite's ISOLATED databases.
 *
 * Tests get their own Postgres and ClickHouse databases, never the ones the
 * application uses. On this box the application databases hold a copy of
 * production, which breaks tests twice over: fixture teardown issues
 * `DELETE FROM events WHERE project_id = ...`, which mutates the dataset the
 * migration goldens are diffed against, and a lightweight delete against a
 * 318M-row table does not finish inside a test timeout.
 *
 * Every test connection string is derived from here — test/bun-preload.ts
 * pins the worker env at these values and test/bootstrap-databases.ts
 * creates and migrates them. Nothing in test/ may hard-code a database name.
 */

const POSTGRES_ORIGIN = 'postgresql://postgres:postgres@localhost:23432';
const CLICKHOUSE_ORIGIN = 'http://localhost:23123';

export const TEST_POSTGRES_DATABASE = 'openpanel_test';
export const TEST_CLICKHOUSE_DATABASE = 'openpanel_test';

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

/**
 * Redis is deliberately NOT isolated — unchanged from the previous pin. It
 * holds no prod copy and no golden, so it carries neither hazard this module
 * exists to remove.
 */
export const TEST_REDIS_URL = 'redis://localhost:23379';
