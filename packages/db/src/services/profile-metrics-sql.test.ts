/**
 * SQL-shape tests for the profile metrics query.
 *
 * Same strategy as chart-sql.test.ts / funnel-sql.test.ts: string assertions
 * always run; `EXPLAIN` validation runs against a locally reachable
 * ClickHouse (`pnpm dock:up`) and skips otherwise.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ch } from '../clickhouse/client';
import { buildProfileMetricsSql } from './profile.service';

const PROJECT_ID = 'test-sql-validation';
const PROFILE_ID = 'profile-1';

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

describe('buildProfileMetricsSql', () => {
  // Every metric is a plain aggregate over the same
  // `profile_id = X AND project_id = Y` slice, so the query must read the
  // events table exactly once — the per-metric-CTE shape scanned it eight
  // times per profile view.
  it('scans the events table exactly once', () => {
    const sql = buildProfileMetricsSql(PROFILE_ID, PROJECT_ID);
    expect(sql.match(/FROM events\b/g)).toHaveLength(1);
    expect(sql.match(/FROM profiles\b/g)).toHaveLength(1);
  });

  it('keeps every metric of the old per-CTE shape', () => {
    const sql = buildProfileMetricsSql(PROFILE_ID, PROJECT_ID);
    for (const metric of [
      'lastSeen',
      'firstSeen',
      'screenViews',
      'sessions',
      'durationAvg',
      'durationP90',
      'totalEvents',
      'uniqueDaysActive',
      'bounceRate',
      'avgEventsPerSession',
      'conversionEvents',
      'avgTimeBetweenSessions',
      'revenue',
    ]) {
      expect(sql).toContain(`as ${metric}`);
    }
  });

  it('escapes the identifiers', () => {
    const sql = buildProfileMetricsSql("p'--", "x'--");
    expect(sql).not.toContain("p'--");
    expect(sql).toContain("'p\\'--'");
  });

  itCH('parses and resolves against ClickHouse', async () => {
    const sql = buildProfileMetricsSql(PROFILE_ID, PROJECT_ID);
    await ch.command({ query: `EXPLAIN ${sql}` });
  });
});
