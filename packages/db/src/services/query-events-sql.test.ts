/**
 * SQL-shape tests for the shared event query.
 *
 * Same strategy as profile-metrics-sql.test.ts: string assertions always run;
 * `EXPLAIN` validation runs against a locally reachable ClickHouse
 * (`pnpm dock:up`) and skips otherwise.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ch } from '../clickhouse/client';
import { buildQueryEventsQuery } from './event.service';

const PROJECT_ID = 'test-sql-validation';

let chReachable = false;

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await ch.command({ query: 'SELECT 1' });
    chReachable = true;
  } catch {
    chReachable = false;
  }
});

afterAll(() => {
  vi.restoreAllMocks();
});

const itCH = (name: string, fn: () => Promise<void>) =>
  it(name, async (ctx) => {
    if (!chReachable) {
      ctx.skip('ClickHouse not reachable at CLICKHOUSE_URL');
    }
    await fn();
  });

describe('buildQueryEventsQuery', () => {
  // Callers label these rows `created_at desc` and call them recent events, so
  // the cut has to happen after the sort rather than wherever the scan starts.
  it('takes the newest rows, not an arbitrary slice', () => {
    const sql = buildQueryEventsQuery({ projectId: PROJECT_ID }).toSQL();
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(sql.indexOf('ORDER BY')).toBeLessThan(sql.indexOf('LIMIT'));
  });

  it('keeps the default and the caller limit', () => {
    expect(buildQueryEventsQuery({ projectId: PROJECT_ID }).toSQL()).toContain(
      'LIMIT 20',
    );
    expect(
      buildQueryEventsQuery({ projectId: PROJECT_ID, limit: 100 }).toSQL(),
    ).toContain('LIMIT 100');
  });

  it('still applies the filters', () => {
    const sql = buildQueryEventsQuery({
      projectId: PROJECT_ID,
      profileId: 'profile-1',
      eventNames: ['session_start'],
    }).toSQL();
    expect(sql).toContain('profile_id');
    expect(sql).toContain('session_start');
  });

  itCH('parses and resolves against ClickHouse', async () => {
    await ch.command({
      query: `EXPLAIN ${buildQueryEventsQuery({ projectId: PROJECT_ID }).toSQL()}`,
    });
  });
});
