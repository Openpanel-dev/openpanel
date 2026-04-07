/**
 * Shared ClickHouse fixture builder for integration tests.
 *
 * Call setupFixtures(projectId) / teardownFixtures(projectId) from any test
 * suite. Each suite uses its own project ID so suites can run concurrently
 * without stomping on each other's data.
 *
 * Fixture dataset (3 users, 8 events, 3 sessions):
 *
 *   Alice   — created 60 days ago, browser: Chrome, country: US
 *             3 events 2 days ago: session_start → page_view(/home) → session_end
 *             1 session  (sess-alice-1, 2d ago, Chrome)
 *
 *   Bob     — created 90 days ago, browser: Chrome, country: SE — NO events (inactive)
 *
 *   Charlie — created 30 days ago, browser: Firefox, country: US
 *             5 events 5 days ago: session_start → screen_view → page_view(/shop) → purchase → session_end
 *             2 sessions (sess-charlie-1 5d ago Firefox, sess-charlie-2 10d ago Firefox bounce)
 *
 * Event UUIDs live in the 00000000-0000-0000-0000-xxxxxxxxxxxx namespace.
 * Because events are scoped by project_id, the same UUIDs are safe across
 * different project IDs (ClickHouse's MergeTree ordering includes project_id).
 */

import { createClient } from '../packages/db/src/clickhouse/client';

// ---------------------------------------------------------------------------
// Well-known fixture IDs — import these in tests instead of hard-coding strings
// ---------------------------------------------------------------------------

export const FIXTURE = {
  profiles: {
    alice: 'profile-alice',
    bob: 'profile-bob',
    charlie: 'profile-charlie',
  },
  sessions: {
    alice1: 'sess-alice-1',
    charlie1: 'sess-charlie-1',
    charlie2: 'sess-charlie-2',
  },
  events: {
    alice: {
      sessionStart: '00000000-0000-0000-0000-000000000001',
      pageView:     '00000000-0000-0000-0000-000000000002',
      sessionEnd:   '00000000-0000-0000-0000-000000000003',
    },
    charlie: {
      sessionStart: '00000000-0000-0000-0000-000000000004',
      screenView:   '00000000-0000-0000-0000-000000000005',
      pageView:     '00000000-0000-0000-0000-000000000006',
      purchase:     '00000000-0000-0000-0000-000000000007',
      sessionEnd:   '00000000-0000-0000-0000-000000000008',
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type ChClient = ReturnType<typeof createClient>;

function getClient() {
  const url = process.env.CLICKHOUSE_URL ?? 'http://localhost:8123';
  return createClient({ url });
}

function timeAgo(now: Date, days: number, minutesOffset = 0) {
  return new Date(now.getTime() - days * 86_400_000 - minutesOffset * 60_000)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, '');
}

function buildEvent(
  now: Date,
  projectId: string,
  id: string,
  name: string,
  profileId: string,
  sessionId: string,
  daysBack: number,
  minutesOffset = 0,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    project_id: projectId,
    profile_id: profileId,
    name,
    session_id: sessionId,
    device_id: `dev-${profileId.replace('profile-', '')}`,
    created_at: timeAgo(now, daysBack, minutesOffset),
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

function buildSession(
  now: Date,
  projectId: string,
  id: string,
  profileId: string,
  daysBack: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    project_id: projectId,
    profile_id: profileId,
    device_id: `dev-${profileId.replace('profile-', '')}`,
    created_at: timeAgo(now, daysBack),
    ended_at: timeAgo(now, daysBack),
    is_bounce: false,
    entry_origin: 'https://example.com',
    entry_path: '/home',
    exit_origin: 'https://example.com',
    exit_path: '/home',
    screen_view_count: 1,
    revenue: 0,
    event_count: 1,
    duration: 120,
    country: 'US',
    region: '',
    city: '',
    device: 'desktop',
    brand: '',
    model: '',
    browser: 'Chrome',
    browser_version: '',
    os: '',
    os_version: '',
    utm_medium: '',
    utm_source: '',
    utm_campaign: '',
    utm_content: '',
    utm_term: '',
    referrer: '',
    referrer_name: '',
    referrer_type: '',
    sign: 1,
    version: 1,
    properties: {},
    ...overrides,
  };
}

async function insertFixtures(client: ChClient, projectId: string) {
  const now = new Date();

  await client.insert({
    table: 'openpanel.profiles',
    values: [
      {
        id: FIXTURE.profiles.alice,
        project_id: projectId,
        first_name: 'Alice',
        last_name: 'Smith',
        email: 'alice@example.com',
        avatar: '',
        is_external: false,
        // browser/country in properties so tests can filter profiles by these fields
        properties: { browser: 'Chrome', country: 'US', device: 'desktop' },
        groups: [],
        created_at: timeAgo(now, 60),
      },
      {
        id: FIXTURE.profiles.bob,
        project_id: projectId,
        first_name: 'Bob',
        last_name: "O'Brien",
        email: 'bob@example.com',
        avatar: '',
        is_external: false,
        // Bob is intentionally inactive (no events) — useful for inactiveDays tests
        properties: { browser: 'Chrome', country: 'SE', device: 'desktop' },
        groups: [],
        created_at: timeAgo(now, 90),
      },
      {
        id: FIXTURE.profiles.charlie,
        project_id: projectId,
        first_name: 'Charlie',
        last_name: 'Brown',
        email: 'charlie@example.com',
        avatar: '',
        is_external: false,
        properties: { browser: 'Firefox', country: 'US', device: 'desktop' },
        groups: [],
        created_at: timeAgo(now, 30),
      },
    ],
    format: 'JSONEachRow',
  });

  // Alice: session_start → page_view → session_end (2 days ago, spaced 2 min apart)
  // Charlie: session_start → screen_view → page_view → purchase → session_end (5 days ago, spaced 5 min apart)
  // Events are spaced so windowFunnel strict_increase mode works correctly.
  await client.insert({
    table: 'openpanel.events',
    values: [
      buildEvent(now, projectId, FIXTURE.events.alice.sessionStart, 'session_start', FIXTURE.profiles.alice, FIXTURE.sessions.alice1, 2, 4),
      buildEvent(now, projectId, FIXTURE.events.alice.pageView,     'page_view',     FIXTURE.profiles.alice, FIXTURE.sessions.alice1, 2, 2, { path: '/home', browser: 'Chrome' }),
      buildEvent(now, projectId, FIXTURE.events.alice.sessionEnd,   'session_end',   FIXTURE.profiles.alice, FIXTURE.sessions.alice1, 2, 0, { duration: 120000 }),

      buildEvent(now, projectId, FIXTURE.events.charlie.sessionStart, 'session_start', FIXTURE.profiles.charlie, FIXTURE.sessions.charlie1, 5, 20, { browser: 'Firefox' }),
      buildEvent(now, projectId, FIXTURE.events.charlie.screenView,   'screen_view',   FIXTURE.profiles.charlie, FIXTURE.sessions.charlie1, 5, 15, { path: '/shop', browser: 'Firefox' }),
      buildEvent(now, projectId, FIXTURE.events.charlie.pageView,     'page_view',     FIXTURE.profiles.charlie, FIXTURE.sessions.charlie1, 5, 10, { path: '/shop', browser: 'Firefox' }),
      buildEvent(now, projectId, FIXTURE.events.charlie.purchase,     'purchase',      FIXTURE.profiles.charlie, FIXTURE.sessions.charlie1, 5,  5, { path: '/checkout', revenue: 9900, browser: 'Firefox' }),
      buildEvent(now, projectId, FIXTURE.events.charlie.sessionEnd,   'session_end',   FIXTURE.profiles.charlie, FIXTURE.sessions.charlie1, 5,  0, { duration: 300000, browser: 'Firefox' }),
    ],
    format: 'JSONEachRow',
  });

  await client.insert({
    table: 'openpanel.sessions',
    values: [
      buildSession(now, projectId, FIXTURE.sessions.alice1, FIXTURE.profiles.alice, 2),
      buildSession(now, projectId, FIXTURE.sessions.charlie1, FIXTURE.profiles.charlie, 5, {
        browser: 'Firefox',
        entry_path: '/shop',
        exit_path: '/checkout',
        revenue: 9900,
        duration: 300,
        screen_view_count: 2,
        event_count: 5,
      }),
      buildSession(now, projectId, FIXTURE.sessions.charlie2, FIXTURE.profiles.charlie, 10, {
        browser: 'Firefox',
        is_bounce: true,
        entry_path: '/shop',
        exit_path: '/shop',
        duration: 15,
      }),
    ],
    format: 'JSONEachRow',
  });
}

async function deleteFixtures(client: ChClient, projectId: string) {
  await Promise.all([
    client.command({ query: `DELETE FROM openpanel.profiles WHERE project_id = '${projectId}'` }),
    client.command({ query: `DELETE FROM openpanel.events WHERE project_id = '${projectId}'` }),
    client.command({ query: `DELETE FROM openpanel.sessions WHERE project_id = '${projectId}'` }),
  ]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function setupFixtures(projectId: string): Promise<void> {
  const client = getClient();
  await deleteFixtures(client, projectId);
  await insertFixtures(client, projectId);
  await client.close();
}

export async function teardownFixtures(projectId: string): Promise<void> {
  const client = getClient();
  await deleteFixtures(client, projectId);
  await client.close();
}
