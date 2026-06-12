/**
 * Deterministic ClickHouse fixture for retention-cohort tests.
 *
 * Unlike `test/fixtures.ts` (which anchors events to `new Date()`), this fixture
 * places every event on a FIXED absolute date so the expected cohort matrix is a
 * stable, hand-computed blueprint. It is the contract the retention engine must
 * satisfy.
 *
 * ---------------------------------------------------------------------------
 * Dataset (all events are name `app_open` unless noted; device_id != profile_id
 * so they survive the cohort_events_mv `profile_id != device_id` filter)
 * ---------------------------------------------------------------------------
 *
 * DAY scenario — window 2024-03-04 .. 2024-03-06 (D0, D1, D2)
 *
 *   user   app_open days     purchase days   first-touch cohort   country
 *   RU1    D0, D1, D2        D1              D0                   US
 *   RU2    D0, D2           D2              D0                   US
 *   RU3    D0               —               D0                   SE
 *   RU4    D1, D2          —               D1                   US
 *   RU5    D1              —               D1                   US
 *
 *   => D0 cohort = {RU1,RU2,RU3} (size 3), D1 cohort = {RU4,RU5} (size 2)
 *
 * WEEK scenario — window 2024-12-29 .. 2025-01-06 (crosses the year boundary,
 * which is exactly what the old toWeek() implementation got wrong)
 *
 *   WU1    app_open 2024-12-30 and 2025-01-06
 *   WU2    app_open 2024-12-30 only
 *
 *   => single cohort (week of 2024-12-29), size 2
 *
 * Use a per-suite projectId so suites can run concurrently.
 */

import { createClient } from '../packages/db/src/clickhouse/client';

// ---------------------------------------------------------------------------
// Well-known ids + absolute dates
// ---------------------------------------------------------------------------

export const RETENTION_FIXTURE = {
  users: {
    ru1: 'retention-ru1',
    ru2: 'retention-ru2',
    ru3: 'retention-ru3',
    ru4: 'retention-ru4',
    ru5: 'retention-ru5',
    wu1: 'retention-wu1',
    wu2: 'retention-wu2',
  },
  // DAY scenario boundaries (inclusive) used as query window
  day: {
    start: '2024-03-04 00:00:00',
    end: '2024-03-06 23:59:59',
    d0: '2024-03-04',
    d1: '2024-03-05',
    d2: '2024-03-06',
  },
  // WEEK scenario boundaries; cohort lands on the Sunday-aligned week start
  week: {
    start: '2024-12-29 00:00:00',
    end: '2025-01-06 23:59:59',
    cohort: '2024-12-29',
  },
  // Saved cohort used for the inCohort filter case (members: RU1, RU4)
  cohort: {
    id: 'retention-cohort-rc',
    members: ['retention-ru1', 'retention-ru4'],
  },
} as const;

/**
 * Hand-computed expected cohort matrices (per-cohort rows only, excluding the
 * leading "Weighted Average" row that processCohortData prepends).
 */
export const RETENTION_BLUEPRINT = {
  // firstEvent = secondEvent = app_open, interval day
  dayOn: [
    { cohort_interval: '2024-03-04', sum: 3, values: [3, 1, 2] },
    { cohort_interval: '2024-03-05', sum: 2, values: [2, 1, 0] },
  ],
  dayOnOrAfter: [
    { cohort_interval: '2024-03-04', sum: 3, values: [3, 2, 2] },
    { cohort_interval: '2024-03-05', sum: 2, values: [2, 1, 0] },
  ],
  // cross-year weekly self-retention, interval week, criteria on
  weekOn: [{ cohort_interval: '2024-12-29', sum: 2, values: [2, 1] }],
  // app_open self-retention, day, criteria on, filtered to country = US.
  // RU3 (country SE) drops out of the D0 cohort -> raw-events path.
  countryUsOn: [
    { cohort_interval: '2024-03-04', sum: 2, values: [2, 1, 2] },
    { cohort_interval: '2024-03-05', sum: 2, values: [2, 1, 0] },
  ],
  // app_open self-retention, day, criteria on, scoped to cohort {RU1, RU4}.
  // inCohort only needs profile_id -> stays on the fast cohort_events_mv path.
  cohortOn: [
    { cohort_interval: '2024-03-04', sum: 1, values: [1, 1, 1] },
    { cohort_interval: '2024-03-05', sum: 1, values: [1, 1, 0] },
  ],
  // Week-over-week active-user retention across the whole fixture.
  // - 2024-03-03: RU1-5 active, none active the next week -> 0% retained
  // - 2024-12-29: WU1+WU2 active, WU1 active next week -> 50% retained
  // - 2025-01-05: WU1 active, none after -> 0%
  weeklySeries: [
    { date: '2024-03-03', active_users: 5, retained_users: 0, retention: 0 },
    { date: '2024-12-29', active_users: 2, retained_users: 1, retention: 50 },
    { date: '2025-01-05', active_users: 1, retained_users: 0, retention: 0 },
  ],
} as const;

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

type ChClient = ReturnType<typeof createClient>;

function getClient(): ChClient {
  const url = process.env.CLICKHOUSE_URL ?? 'http://localhost:8123';
  return createClient({ url });
}

let eventSeq = 0;

function buildEvent(
  projectId: string,
  profileId: string,
  name: string,
  createdAt: string,
  overrides: Record<string, unknown> = {}
) {
  eventSeq += 1;
  return {
    // Deterministic, collision-free uuid in the retention namespace
    id: `00000000-0000-4000-8000-${String(eventSeq).padStart(12, '0')}`,
    project_id: projectId,
    profile_id: profileId,
    device_id: `dev-${profileId}`,
    name,
    session_id: `sess-${profileId}`,
    created_at: createdAt,
    path: '/',
    origin: 'https://example.com',
    referrer: '',
    referrer_name: '',
    referrer_type: '',
    revenue: 0,
    duration: 0,
    properties: {},
    groups: [],
    country: 'US',
    city: '',
    region: '',
    sdk_name: 'web',
    sdk_version: '1.0.0',
    os: '',
    os_version: '',
    browser: 'Chrome',
    browser_version: '',
    device: 'desktop',
    brand: '',
    model: '',
    ...overrides,
  };
}

function buildEvents(projectId: string) {
  const { users, day } = RETENTION_FIXTURE;
  const dayAt = (date: string) => `${date} 12:00:00`;

  const us = { country: 'US' };
  const se = { country: 'SE' };

  return [
    // --- DAY scenario: app_open (self-retention) ---
    buildEvent(projectId, users.ru1, 'app_open', dayAt(day.d0), us),
    buildEvent(projectId, users.ru1, 'app_open', dayAt(day.d1), us),
    buildEvent(projectId, users.ru1, 'app_open', dayAt(day.d2), us),
    buildEvent(projectId, users.ru2, 'app_open', dayAt(day.d0), us),
    buildEvent(projectId, users.ru2, 'app_open', dayAt(day.d2), us),
    buildEvent(projectId, users.ru3, 'app_open', dayAt(day.d0), se),
    buildEvent(projectId, users.ru4, 'app_open', dayAt(day.d1), us),
    buildEvent(projectId, users.ru4, 'app_open', dayAt(day.d2), us),
    buildEvent(projectId, users.ru5, 'app_open', dayAt(day.d1), us),

    // --- DAY scenario: purchase (cross-event retention) ---
    buildEvent(projectId, users.ru1, 'purchase', dayAt(day.d1), us),
    buildEvent(projectId, users.ru2, 'purchase', dayAt(day.d2), us),

    // --- WEEK scenario: app_open crossing the 2024->2025 boundary ---
    // 2024-12-30 (Mon) falls in the Sunday-aligned week starting 2024-12-29.
    buildEvent(projectId, users.wu1, 'app_open', '2024-12-30 12:00:00'),
    buildEvent(projectId, users.wu1, 'app_open', '2025-01-06 12:00:00'),
    buildEvent(projectId, users.wu2, 'app_open', '2024-12-30 12:00:00'),
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function buildCohortMembers(projectId: string) {
  return RETENTION_FIXTURE.cohort.members.map((profileId) => ({
    project_id: projectId,
    cohort_id: RETENTION_FIXTURE.cohort.id,
    profile_id: profileId,
    matched_at: RETENTION_FIXTURE.day.start,
    matching_properties: {},
    version: 1,
  }));
}

async function deleteFixtures(client: ChClient, projectId: string) {
  await Promise.all([
    client.command({
      query: `DELETE FROM openpanel.events WHERE project_id = '${projectId}'`,
    }),
    // Materialized views are NOT touched by DELETE FROM events; mutate them too
    // so reruns stay clean.
    client.command({
      query: `ALTER TABLE openpanel.cohort_events_mv DELETE WHERE project_id = '${projectId}'`,
    }),
    client.command({
      query: `DELETE FROM openpanel.cohort_members WHERE project_id = '${projectId}'`,
    }),
  ]);
}

export async function setupRetentionFixtures(projectId: string): Promise<void> {
  const client = getClient();
  try {
    await deleteFixtures(client, projectId);
    await client.insert({
      table: 'openpanel.events',
      values: buildEvents(projectId),
      format: 'JSONEachRow',
    });
    await client.insert({
      table: 'openpanel.cohort_members',
      values: buildCohortMembers(projectId),
      format: 'JSONEachRow',
    });
  } finally {
    await client.close();
  }
}

export async function teardownRetentionFixtures(
  projectId: string
): Promise<void> {
  const client = getClient();
  try {
    await deleteFixtures(client, projectId);
  } finally {
    await client.close();
  }
}
