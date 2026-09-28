/**
 * SQL-syntax tests for the overview module's `getRawWhereClause` (the UTM
 * remapping). Moved from packages/db/src/services/overview-sql.test.ts
 * alongside its subject, which moved to core in M7-005 — same pattern as the
 * chart cases moving to chart.sql.test.ts with theirs. M12-002 put
 * `getRawWhereClause` on the `sql` tag, so these assertions read the rendered
 * statement AND its bound params instead of one escaped string; the rest of the
 * overview module's queries already run through overview.sql.ts, covered by
 * overview.sql.test.ts. M10-005 turned it from a class method into a module
 * function — it never needed a client, being pure fragment building.
 *
 * Strategy: build the SQL string, then run `EXPLAIN <sql>` against the local
 * ClickHouse instance. EXPLAIN parses the query, resolves columns, and builds
 * the query plan without executing it — so we catch UNKNOWN_IDENTIFIER,
 * AMBIGUOUS_IDENTIFIER and bad JOIN ON expressions without needing seeded data.
 * WITH FILL TO < FROM is a runtime check, so it's covered by a plain string
 * assertion instead.
 *
 * Requires a locally reachable CH at http://localhost:23123/openpanel. All
 * `itCH` tests auto-skip if CH is unreachable.
 */

import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { ch } from '@openpanel/db/src/clickhouse/client';
import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';
import { getRawWhereClause } from '../overview.service';

const PROJECT_ID = 'test-sql-validation';

let chReachable = false;
let logSpy: ReturnType<typeof spyOn>;

async function explain(
  query: string,
  queryParams: Record<string, unknown>
): Promise<void> {
  // EXPLAIN runs the parser + analyzer and builds the query plan, which
  // catches UNKNOWN_IDENTIFIER and AMBIGUOUS_IDENTIFIER. It does not execute.
  await ch.command({ query: `EXPLAIN ${query}`, query_params: queryParams });
}

/** The clause plus the values it binds — both halves of a converted filter. */
function rendered(where: SqlFragment | null) {
  return (
    where ?? { toStatement: () => ({ query: '', query_params: {} }) }
  ).toStatement();
}

beforeAll(async () => {
  // The chart service is chatty; mute log spam during the test run.
  logSpy = spyOn(console, 'log').mockImplementation(() => undefined);
  try {
    await ch.command({ query: 'SELECT 1' });
    chReachable = true;
  } catch {
    // CH not running locally — skip every test.
    chReachable = false;
  }
});

afterAll(() => {
  logSpy.mockRestore();
});

const itCH = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!chReachable) {
      console.warn(
        '[overview-sql] skipping: ClickHouse not reachable at CLICKHOUSE_URL'
      );
      return;
    }
    await fn();
  });

describe('overview.service / getRawWhereClause (UTM remapping)', () => {
  it('rewrites utm_* to properties[__query.utm_*] for the events table', () => {
    const { query, query_params } = rendered(
      getRawWhereClause('events', [
        { name: 'utm_source', operator: 'is', value: ['awn'] },
      ])
    );
    // The map KEY binds too, so the shape is asserted on the statement and the
    // key on the params.
    expect(query).toContain('properties[{p1:String}]');
    expect(query).not.toMatch(/(?<![._\w])utm_source\s*=/);
    expect(query_params).toEqual({ p1: '__query.utm_source', p2: 'awn' });
  });

  it('keeps utm_* as a top-level column for the sessions table', () => {
    const { query, query_params } = rendered(
      getRawWhereClause('sessions', [
        { name: 'utm_source', operator: 'is', value: ['awn'] },
      ])
    );
    expect(query).toMatch(/(?<![._\w])utm_source\s*=/);
    expect(query).not.toContain('properties[');
    expect(query_params).toEqual({ p1: 'awn' });
  });

  it('drops non-whitelisted filters', () => {
    const where = getRawWhereClause('events', [
      { name: 'malicious_column', operator: 'is', value: ['x'] },
    ]);
    expect(where).toBeNull();
  });

  itCH(
    'events utm_source filter parses against real events table',
    async () => {
      const { query, query_params } = rendered(
        getRawWhereClause('events', [
          { name: 'utm_source', operator: 'is', value: ['awn'] },
        ])
      );
      expect(query).toBeTruthy();
      await explain(
        `SELECT count() FROM events WHERE project_id = '${PROJECT_ID}' AND ${query}`,
        query_params
      );
    }
  );

  itCH(
    'sessions utm_source filter parses against real sessions table',
    async () => {
      const { query, query_params } = rendered(
        getRawWhereClause('sessions', [
          { name: 'utm_source', operator: 'is', value: ['awn'] },
        ])
      );
      expect(query).toBeTruthy();
      await explain(
        `SELECT count() FROM sessions WHERE project_id = '${PROJECT_ID}' AND ${query}`,
        query_params
      );
    }
  );
});
