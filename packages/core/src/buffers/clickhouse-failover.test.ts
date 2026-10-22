import { afterAll, describe, expect, it } from 'bun:test';

// This is a test file, which the `core-uses-ctx-not-db-internals` lint rule
// exempts: the round-robin/retry client the buffers are handed (`ch` /
// `chQuery`, `@openpanel/db`'s exports) must survive a dead node, so the
// subject is imported directly here rather than through `BufferDeps.ch`.
function loadClickHouse() {
  return import('@openpanel/db/src/clickhouse/client');
}

/**
 * An ECONNREFUSED from a dead ClickHouse node must be retried (sin-binned) on
 * the client the buffers are handed as `BufferDeps.ch`, including `ch.insert`.
 *
 * `CLICKHOUSE_URL` is a two-node list whose first node (port 1, unbindable
 * without root) is reliably refused. The picker starts at index 0, so every
 * call fails over to node 1; a rejection that escaped would throw or hang.
 */

const CLICKHOUSE_TEST_DATABASE = 'openpanel_test';
const DEFAULT_CLICKHOUSE_BASE_URL = 'http://localhost:23123';
const DEAD_NODE_URL = 'http://127.0.0.1:1';
const CLICKHOUSE_TEST_REQUEST_TIMEOUT_MS = 120_000;

function liveNodeUrl(): { withDatabase: string } {
  const configured = (process.env.CLICKHOUSE_URL ?? '').split(',')[0]?.trim();
  const url = new URL(configured || DEFAULT_CLICKHOUSE_BASE_URL);
  url.pathname = `/${CLICKHOUSE_TEST_DATABASE}`;
  return { withDatabase: url.toString() };
}

const { withDatabase: LIVE_NODE_URL } = liveNodeUrl();

// The shared bootstrap also applies the schema, which `ch.insert` below
// needs; this file may be the first in its shard to touch ClickHouse. It
// addresses the live node directly, so the dead node set below never sees it.
async function bootstrapTestDatabase(): Promise<boolean> {
  try {
    const { bootstrapTestDatabases } = await import(
      '../../../../test/bootstrap-databases'
    );
    await bootstrapTestDatabases();
    return true;
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

// `bun test` shares one process and one `process.env` across every file in
// the run, unlike vitest's per-file env reset. Whichever file first calls
// `loadClickHouse()` pins `@openpanel/db/src/clickhouse/client`'s picker for
// the rest of the run regardless of env set here, but OTHER files that read
// `CLICKHOUSE_URL` directly (e.g. test fixtures building their own throwaway
// client) are not protected by that — an unrestored mutation here leaks into
// them. Snapshot and restore, exactly like `mock.module` must be.
const originalClickhouseEnv = {
  CLICKHOUSE_URL: process.env.CLICKHOUSE_URL,
  CLICKHOUSE_REQUEST_TIMEOUT_MS: process.env.CLICKHOUSE_REQUEST_TIMEOUT_MS,
  CLICKHOUSE_UNHEALTHY_MARK_MS: process.env.CLICKHOUSE_UNHEALTHY_MARK_MS,
};

function restoreClickhouseEnv(): void {
  for (const [key, value] of Object.entries(originalClickhouseEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

// `loadClickHouse()` above lazily imports `@openpanel/db/src/clickhouse/client`
// on first call, which reads CLICKHOUSE_URL once at module evaluation — so
// these must be set before this file's first `loadClickHouse()` call.
process.env.CLICKHOUSE_URL = `${DEAD_NODE_URL}/${CLICKHOUSE_TEST_DATABASE},${LIVE_NODE_URL}`;
process.env.CLICKHOUSE_REQUEST_TIMEOUT_MS = String(
  CLICKHOUSE_TEST_REQUEST_TIMEOUT_MS
);
// Without this the dead node is sin-binned after the first failure and later
// cases never exercise the retry at all.
process.env.CLICKHOUSE_UNHEALTHY_MARK_MS = '0';

// After the env is pinned: the bootstrap evaluates the client module, and
// that evaluation is what reads the two-node list.
const clickhouseReachable = await bootstrapTestDatabase();
const failoverIsReal = await deadNodeIsRefused();

afterAll(() => {
  restoreClickhouseEnv();
});

const describeAgainstClickhouse = describe.skipIf(
  !(clickhouseReachable && failoverIsReal)
);

describeAgainstClickhouse(
  'core buffer/client seam survives round-robin failover (M8-006)',
  () => {
    it("ch.insert (the buffers' write path) retries onto the live node instead of rejecting", async () => {
      const { ch, chQuery, TABLE_NAMES } = await loadClickHouse();
      // `events.id` is a ClickHouse `UUID` column — a real UUID, not the
      // `evt_<nanoid>` display id, or the fixed-width UUID reader misparses
      // the row and every subsequent field.
      const eventId = crypto.randomUUID();
      const projectId = 'clickhouse-failover-seam-test';

      // Same call shape event-buffer.ts uses: a JSONEachRow stream straight
      // into ch.insert, which is the Proxy-wrapped, withRetry-backed client.
      await ch.insert({
        table: TABLE_NAMES.events,
        values: [
          JSON.stringify({
            id: eventId,
            name: 'seam_test',
            project_id: projectId,
            device_id: 'seam-test-device',
            created_at: new Date().toISOString().replace('T', ' ').slice(0, 23),
          }),
        ],
        format: 'JSONEachRow',
      });

      const rows = await chQuery<{ id: string }>(
        `SELECT id FROM ${TABLE_NAMES.events} WHERE id = '${eventId}' AND project_id = '${projectId}'`
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(eventId);
    });

    it("chQuery (the buffers' read path, e.g. group/profile merge fetches) also retries", async () => {
      const { chQuery } = await loadClickHouse();
      const rows = await chQuery<{ value: number }>('SELECT 1 AS value');
      expect(rows[0]?.value).toBe(1);
    });
  }
);
