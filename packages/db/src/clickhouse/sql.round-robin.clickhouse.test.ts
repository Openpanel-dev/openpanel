import { describe, expect, it } from 'vitest';
import { sql } from './sql';

/**
 * ADR-013 R1, the half the round-trip suite cannot reach: bound params must
 * travel through `withRetry` / round-robin, so a parameterised read keeps the
 * failover behaviour `chQueryWithMeta` already had for raw text.
 *
 * The setup is a two-node `CLICKHOUSE_URL` whose first node is dead. The
 * picker starts at index 0, so every query here fails over to node 1 — if the
 * params were dropped anywhere on the retry path, the second attempt would
 * return a different answer or an error instead of the payload.
 */

const CLICKHOUSE_TEST_DATABASE = 'openpanel_test';
const DEFAULT_CLICKHOUSE_BASE_URL = 'http://localhost:8123';

/** Port 1 is privileged and unbindable without root, so it is reliably refused. */
const DEAD_NODE_URL = 'http://127.0.0.1:1';

/** Same reason as the round-trip suite: one local node, many parallel files. */
const CLICKHOUSE_TEST_REQUEST_TIMEOUT_MS = 120_000;

function liveNodeUrl(): { base: string; withDatabase: string } {
  const configured = (process.env.CLICKHOUSE_URL ?? '').split(',')[0]?.trim();
  const url = new URL(configured || DEFAULT_CLICKHOUSE_BASE_URL);
  url.pathname = '/';
  const base = url.toString();
  url.pathname = `/${CLICKHOUSE_TEST_DATABASE}`;
  return { base, withDatabase: url.toString() };
}

const { base: LIVE_BASE_URL, withDatabase: LIVE_NODE_URL } = liveNodeUrl();

async function bootstrapTestDatabase(): Promise<boolean> {
  try {
    const response = await fetch(LIVE_BASE_URL, {
      method: 'POST',
      body: `CREATE DATABASE IF NOT EXISTS ${CLICKHOUSE_TEST_DATABASE}`,
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** If port 1 ever answers, the failover never happens and this suite would
 *  pass without testing anything. */
async function deadNodeIsRefused(): Promise<boolean> {
  try {
    await fetch(DEAD_NODE_URL, { method: 'POST', body: 'SELECT 1' });
    return false;
  } catch {
    return true;
  }
}

const clickhouseReachable = await bootstrapTestDatabase();
const failoverIsReal = await deadNodeIsRefused();

// ./client reads these once, at module evaluation.
process.env.CLICKHOUSE_URL = `${DEAD_NODE_URL}/${CLICKHOUSE_TEST_DATABASE},${LIVE_NODE_URL}`;
process.env.CLICKHOUSE_REQUEST_TIMEOUT_MS = String(
  CLICKHOUSE_TEST_REQUEST_TIMEOUT_MS
);
// Without this the dead node is sin-binned after the first failure and the
// later cases never exercise the retry at all.
process.env.CLICKHOUSE_UNHEALTHY_MARK_MS = '0';

const { chQuery, chQueryWithMeta } = await import('./client');

const HOSTILE = `it's a "quoted" \\ backslash {p1:String} }brace{`;

const describeAgainstClickhouse = describe.skipIf(
  !(clickhouseReachable && failoverIsReal)
);

describeAgainstClickhouse(
  'query_params survive round-robin failover (R1)',
  () => {
    it('carries bound params to the node the retry lands on', async () => {
      const rows = await chQuery<{ value: string }>(
        sql`SELECT ${sql.string(HOSTILE)} AS value`
      );
      expect(rows[0]?.value).toBe(HOSTILE);
    });

    it('carries composite params too', async () => {
      const items = [HOSTILE, "', 'injected"];
      const rows = await chQuery<{ items: string[]; at: string }>(sql`
      SELECT ${sql.array('String', items)} AS items,
             toString(${sql.dateTime64('2026-04-29 13:45:07.123')}) AS at
    `);
      expect(rows[0]?.items).toEqual(items);
      expect(rows[0]?.at).toBe('2026-04-29 13:45:07.123');
    });

    it('keeps the meta path parameterised as well', async () => {
      const result = await chQueryWithMeta<{ value: string }>(
        sql`SELECT ${sql.string(HOSTILE)} AS value`
      );
      expect(result.data[0]?.value).toBe(HOSTILE);
    });

    it('leaves the plain-string path unchanged', async () => {
      // The 122 existing `chQuery(string)` call sites must be unaffected by the
      // params slot: no params in, no params on the wire.
      const rows = await chQuery<{ value: number }>('SELECT 1 AS value');
      expect(rows[0]?.value).toBe(1);
    });
  }
);
