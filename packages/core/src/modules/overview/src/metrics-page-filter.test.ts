/**
 * Behavioural test for `metricsWithPageFilterQuery`, executed against the
 * isolated `openpanel_test` ClickHouse (pinned by test/preload.ts) — the
 * counterpart of overview.sql.test.ts's EXPLAIN-only check.
 *
 * It pins the one property the golden master cannot reach: the query's
 * window-wide `overall_*` columns come from a different aggregate than the
 * daily rows, and `overall_bounce_rate` comes from a different *table*. The
 * seeded data therefore puts the sessions on a day the events are not on, so
 * the daily LEFT JOIN misses on every row — and the overall bounce rate must
 * still arrive. A page filter matching nothing must leave all three
 * `overall_*` columns NULL, which is what `getMetricsWithPageFilter` reads to
 * tell "no data" from "zero".
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

const PROJECT_ID = 'overview-metrics-page-filter-test';
const FILTERED_PATH = '/pricing';
const SESSION_DAY = '2026-01-05';
const EVENT_DAY = '2026-01-08';
const WINDOW_START = '2026-01-01 00:00:00';
const WINDOW_END = '2026-01-15 00:00:00';
const DURATION_PATH = '/checkout';
const DURATION_SESSION_ID = 'session-duration';
const SECONDS_ON_DURATION_PATH = 60;
/** One bounced and one non-bounced session, both on `SESSION_DAY`. */
const EXPECTED_OVERALL_BOUNCE_RATE = 50;

interface MetricsRow {
  date: string;
  bounce_rate: number;
  unique_visitors: number;
  total_sessions: number;
  avg_session_duration: number;
  total_screen_views: number;
  views_per_session: number;
  overall_unique_visitors: number | null;
  overall_total_sessions: number | null;
  overall_bounce_rate: number | null;
}

let ch: typeof import('@openpanel/db/src/clickhouse/client').ch;
let OV: typeof import('./overview.sql');
let getRawWhereClause: typeof import('../overview.service').getRawWhereClause;

async function metricsFor(path: string): Promise<MetricsRow[]> {
  const filters = [
    { id: 'a', name: 'path', operator: 'is' as const, value: [path] },
  ];
  const { query, query_params } = OV.metricsWithPageFilterQuery({
    projectId: PROJECT_ID,
    startDate: WINDOW_START,
    endDate: WINDOW_END,
    interval: 'day',
    rawSessionFilterWhere: getRawWhereClause('sessions', filters),
    rawEventFilterWhere: getRawWhereClause('events', filters),
  }).toStatement();
  const result = await ch.query({
    query,
    query_params,
    format: 'JSONEachRow',
    clickhouse_settings: { session_timezone: 'UTC' },
  });
  return result.json<MetricsRow>();
}

const session = (id: string, isBounce: boolean) => ({
  id,
  project_id: PROJECT_ID,
  profile_id: `profile-${id}`,
  device_id: `device-${id}`,
  created_at: `${SESSION_DAY} 09:00:00`,
  ended_at: `${SESSION_DAY} 09:01:00`,
  is_bounce: isBounce,
  entry_path: FILTERED_PATH,
  exit_path: FILTERED_PATH,
  screen_view_count: 1,
  event_count: 1,
  duration: 60,
  sign: 1,
  version: 1,
});

const screenView = (id: string, index: number) => ({
  id,
  project_id: PROJECT_ID,
  name: 'screen_view',
  created_at: `${EVENT_DAY} 1${index}:00:00`,
  profile_id: `profile-event-${index}`,
  session_id: `session-event-${index}`,
  path: FILTERED_PATH,
});

/** `/home` → `DURATION_PATH` → `/home`, so the filtered view is followed only by another page. */
const durationSessionViews = [
  ['00000000-0000-0000-0000-0000000000c1', '/home', '10:00:00'],
  ['00000000-0000-0000-0000-0000000000c2', DURATION_PATH, '10:00:30'],
  ['00000000-0000-0000-0000-0000000000c3', '/home', '10:01:30'],
].map(([id, path, time]) => ({
  id,
  project_id: PROJECT_ID,
  name: 'screen_view',
  created_at: `${SESSION_DAY} ${time}`,
  profile_id: 'profile-duration',
  session_id: DURATION_SESSION_ID,
  path,
}));

beforeAll(async () => {
  ({ ch } = await import('@openpanel/db/src/clickhouse/client'));
  OV = await import('./overview.sql');
  ({ getRawWhereClause } = await import('../overview.service'));

  const { bootstrapTestDatabases } = await import(
    '../../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();

  await ch.command({
    query: `DELETE FROM sessions WHERE project_id = '${PROJECT_ID}'`,
  });
  await ch.command({
    query: `DELETE FROM events WHERE project_id = '${PROJECT_ID}'`,
  });
  await ch.insert({
    table: 'sessions',
    values: [
      session('00000000-0000-0000-0000-0000000000a1', true),
      session('00000000-0000-0000-0000-0000000000a2', false),
    ],
    format: 'JSONEachRow',
  });
  await ch.insert({
    table: 'events',
    values: [
      screenView('00000000-0000-0000-0000-0000000000b1', 1),
      screenView('00000000-0000-0000-0000-0000000000b2', 2),
      ...durationSessionViews,
    ],
    format: 'JSONEachRow',
  });
});

afterAll(async () => {
  await ch.command({
    query: `DELETE FROM sessions WHERE project_id = '${PROJECT_ID}'`,
  });
  await ch.command({
    query: `DELETE FROM events WHERE project_id = '${PROJECT_ID}'`,
  });
});

describe('metricsWithPageFilterQuery — window-wide totals', () => {
  it('carries overall_bounce_rate onto days the sessions aggregate has no row for', async () => {
    const rows = await metricsFor(FILTERED_PATH);
    const eventRow = rows.find((row) => row.total_screen_views > 0);

    expect(eventRow?.date).toBe(`${EVENT_DAY} 00:00:00`);
    // The join misses: there is no session bucketed on the event day.
    expect(eventRow?.bounce_rate).toBe(0);
    expect(eventRow?.overall_bounce_rate).toBe(EXPECTED_OVERALL_BOUNCE_RATE);
    expect(eventRow?.overall_unique_visitors).toBe(2);
    expect(eventRow?.overall_total_sessions).toBe(2);
    expect(eventRow?.total_screen_views).toBe(2);
  });

  it('leaves every overall_* column NULL when the page filter matches nothing', async () => {
    const rows = await metricsFor('/no-such-page');

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.overall_unique_visitors).toBeNull();
      expect(row.overall_total_sessions).toBeNull();
      expect(row.overall_bounce_rate).toBeNull();
      expect(row.total_screen_views).toBe(0);
    }
  });
});

describe('metricsWithPageFilterQuery — session duration', () => {
  it('measures a filtered view up to the next view of any page in its session', async () => {
    const rows = await metricsFor(DURATION_PATH);
    const day = rows.find((row) => row.total_screen_views > 0);

    expect(day?.total_screen_views).toBe(1);
    expect(day?.avg_session_duration).toBe(SECONDS_ON_DURATION_PATH);
  });

  it('reports 0 rather than null for a bucket whose views have no measurable duration', async () => {
    const rows = await metricsFor(FILTERED_PATH);

    for (const row of rows) {
      expect(row.avg_session_duration).not.toBeNull();
    }
  });
});
