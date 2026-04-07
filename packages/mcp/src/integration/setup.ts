import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@openpanel/db';
import { setupFixtures, teardownFixtures } from '../../../../test/clickhouse-fixtures';

export { FIXTURE } from '../../../../test/clickhouse-fixtures';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const TEST_PROJECT_ID = 'mcp-integration-test';

async function ensureSchema() {
  const client = createClient({
    url: process.env.CLICKHOUSE_URL ?? 'http://localhost:8123',
  });

  const sql = readFileSync(join(__dirname, 'clickhouse-schema.sql'), 'utf8');
  const statements = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await Promise.all(statements.map((statement) => client.command({ query: statement })));
  await client.close();
}

export async function setup() {
  await ensureSchema();
  await setupFixtures(TEST_PROJECT_ID);
}

export async function teardown() {
  await teardownFixtures(TEST_PROJECT_ID);
}
