/**
 * SQL-syntax tests for `OverviewService.getRawWhereClause` (the UTM
 * remapping). Moved from packages/db/src/services/overview-sql.test.ts
 * (M8-005) alongside its subject, which moved to core in M7-005 — same
 * pattern as the chart cases moving to chart.sql.test.ts with theirs
 * (M7-003). `getRawWhereClause` itself is still clix/sqlstring-based
 * (pre-ADR-013); the rest of OverviewService's queries already run through
 * overview.sql.ts, covered by overview.sql.test.ts.
 *
 * Strategy: build the SQL string, then run `EXPLAIN <sql>` against the local
 * ClickHouse instance. EXPLAIN parses the query, resolves columns, and builds
 * the query plan without executing it — so we catch UNKNOWN_IDENTIFIER,
 * AMBIGUOUS_IDENTIFIER and bad JOIN ON expressions without needing seeded
 * data. WITH FILL TO < FROM is a runtime check, so it's covered by a plain
 * string assertion instead.
 *
 * Requires a locally reachable CH at http://localhost:8123/openpanel. All
 * `itCH` tests auto-skip if CH is unreachable.
 */

import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { ch } from '@openpanel/db/src/clickhouse/client';
import { OverviewService } from '../overview.service';

const PROJECT_ID = 'test-sql-validation';

let chReachable = false;
let logSpy: ReturnType<typeof spyOn>;

async function explain(sql: string): Promise<void> {
  // EXPLAIN runs the parser + analyzer and builds the query plan, which
  // catches UNKNOWN_IDENTIFIER and AMBIGUOUS_IDENTIFIER. It does not execute.
  await ch.command({ query: `EXPLAIN ${sql}` });
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
  const svc = new OverviewService(ch);

  it('rewrites utm_* to properties[__query.utm_*] for the events table', () => {
    const where = svc.getRawWhereClause('events', [
      { name: 'utm_source', operator: 'is', value: ['awn'] },
    ]);
    expect(where).toContain("properties['__query.utm_source']");
    expect(where).not.toMatch(/(?<![._\w])utm_source\s*=/);
  });

  it('keeps utm_* as a top-level column for the sessions table', () => {
    const where = svc.getRawWhereClause('sessions', [
      { name: 'utm_source', operator: 'is', value: ['awn'] },
    ]);
    expect(where).toMatch(/(?<![._\w])utm_source\s*=/);
    expect(where).not.toContain("properties['__query.utm_source']");
  });

  it('drops non-whitelisted filters', () => {
    const where = svc.getRawWhereClause('events', [
      { name: 'malicious_column', operator: 'is', value: ['x'] },
    ]);
    expect(where).toBe('');
  });

  itCH(
    'events utm_source filter parses against real events table',
    async () => {
      const where = svc.getRawWhereClause('events', [
        { name: 'utm_source', operator: 'is', value: ['awn'] },
      ]);
      expect(where).toBeTruthy();
      await explain(
        `SELECT count() FROM events WHERE project_id = '${PROJECT_ID}' AND ${where}`
      );
    }
  );

  itCH(
    'sessions utm_source filter parses against real sessions table',
    async () => {
      const where = svc.getRawWhereClause('sessions', [
        { name: 'utm_source', operator: 'is', value: ['awn'] },
      ]);
      expect(where).toBeTruthy();
      await explain(
        `SELECT count() FROM sessions WHERE project_id = '${PROJECT_ID}' AND ${where}`
      );
    }
  );
});
