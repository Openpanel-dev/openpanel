/**
 * Creates and migrates the suite's isolated databases (see ./databases).
 *
 * Called from globalSetup before any fixture loads. Every step is idempotent,
 * so a warm box pays only the cost of the checks.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '../packages/db/src/clickhouse/client';
import { PrismaClient } from '../packages/db/src/generated/prisma/client';
import {
  clickhouseUrl,
  POSTGRES_MAINTENANCE_URL,
  TEST_CLICKHOUSE_DATABASE,
  TEST_CLICKHOUSE_URL,
  TEST_DATABASE_URL,
  TEST_POSTGRES_DATABASE,
} from './databases';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const prismaBin = path.join(repoRoot, 'packages/db/node_modules/.bin/prisma');
const prismaSchema = path.join(repoRoot, 'packages/db/prisma/schema.prisma');
const clickhouseSchema = path.join(testDir, 'clickhouse-schema.sql');

/** Always present; only used as a foothold for `CREATE DATABASE`. */
const CLICKHOUSE_DEFAULT_DATABASE = 'default';

// Every statement in clickhouse-schema.sql is terminated by a line holding
// nothing but ';'.
const STATEMENT_SEPARATOR = '\n;';
const COMMENT_PREFIX = '--';

async function ensurePostgresDatabase() {
  const maintenance = new PrismaClient({
    datasources: { db: { url: POSTGRES_MAINTENANCE_URL } },
  });
  try {
    const existing = await maintenance.$queryRawUnsafe<unknown[]>(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      TEST_POSTGRES_DATABASE
    );
    if (existing.length === 0) {
      // Identifier, not a value — it cannot be parameterised. The name is a
      // module constant, never user input.
      await maintenance.$executeRawUnsafe(
        `CREATE DATABASE "${TEST_POSTGRES_DATABASE}"`
      );
    }
  } finally {
    await maintenance.$disconnect();
  }
}

function migratePostgresSchema() {
  execFileSync(prismaBin, ['migrate', 'deploy', '--schema', prismaSchema], {
    cwd: repoRoot,
    // Both: schema.prisma's datasource declares `directUrl`, and the repo's
    // .env leaves DATABASE_URL_DIRECT as an unexpanded shell reference that
    // the Prisma CLI's own dotenv loader cannot resolve.
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      DATABASE_URL_DIRECT: TEST_DATABASE_URL,
    },
    stdio: 'pipe',
  });
}

function readClickhouseStatements() {
  return readFileSync(clickhouseSchema, 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith(COMMENT_PREFIX))
    .join('\n')
    .split(STATEMENT_SEPARATOR)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function ensureClickhouseDatabase() {
  const server = createClient({
    url: clickhouseUrl(CLICKHOUSE_DEFAULT_DATABASE),
  });
  try {
    await server.command({
      query: `CREATE DATABASE IF NOT EXISTS ${TEST_CLICKHOUSE_DATABASE}`,
    });
  } finally {
    await server.close();
  }
}

async function migrateClickhouseSchema() {
  const client = createClient({ url: TEST_CLICKHOUSE_URL });
  try {
    for (const query of readClickhouseStatements()) {
      await client.command({ query });
    }
  } finally {
    await client.close();
  }
}

export async function bootstrapTestDatabases() {
  await ensurePostgresDatabase();
  migratePostgresSchema();
  await ensureClickhouseDatabase();
  await migrateClickhouseSchema();
}
