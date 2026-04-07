import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@openpanel/db';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const TEST_PROJECT_ID = 'mcp-integration-test';

function getClient() {
  const url = process.env.CLICKHOUSE_URL ?? 'http://localhost:8123';
  return createClient({ url });
}

export async function setup() {
  const client = await getClient();

  // Create tables — strip comment lines first so semicolons inside comments
  // don't produce spurious empty statements when splitting.
  const sql = readFileSync(join(__dirname, 'clickhouse-schema.sql'), 'utf8');
  const statements = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // Run all CREATE TABLE / CREATE DATABASE statements in parallel — they are
  // independent so there's no ordering requirement.
  await Promise.all(statements.map((statement) => client.command({ query: statement })));

  // Clean up any leftover data from a previous run
  await cleanTestData(client);

  const now = new Date();
  // minutesOffset shifts the time within the day so events get distinct timestamps
  // (required for ClickHouse windowFunnel strict_increase mode)
  const timeAgo = (days: number, minutesOffset = 0) =>
    new Date(now.getTime() - days * 86_400_000 - minutesOffset * 60_000)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '');
  const daysAgo = (n: number) => timeAgo(n);

  // Profiles
  await client.insert({
    table: 'openpanel.profiles',
    values: [
      // Alice — active recently (event 2 days ago)
      {
        id: 'profile-alice',
        project_id: TEST_PROJECT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
        email: 'alice@example.com',
        avatar: '',
        is_external: false,
        properties: {},
        groups: [],
        created_at: daysAgo(60),
      },
      // Bob — inactive (no events in last 30 days)
      {
        id: 'profile-bob',
        project_id: TEST_PROJECT_ID,
        first_name: 'Bob',
        last_name: "O'Brien",
        email: 'bob@example.com',
        avatar: '',
        is_external: false,
        properties: { country: 'SE' },
        groups: [],
        created_at: daysAgo(90),
      },
      // Charlie — performed 'purchase' and has many sessions
      {
        id: 'profile-charlie',
        project_id: TEST_PROJECT_ID,
        first_name: 'Charlie',
        last_name: 'Brown',
        email: 'charlie@example.com',
        avatar: '',
        is_external: false,
        properties: {},
        groups: [],
        created_at: daysAgo(30),
      },
    ],
    format: 'JSONEachRow',
  });

  // Helper to build a minimal event row
  function event(
    id: string,
    name: string,
    profileId: string,
    sessionId: string,
    deviceId: string,
    daysBack: number,
    overrides: Record<string, unknown> = {},
    minutesOffset = 0,
  ) {
    return {
      id,
      project_id: TEST_PROJECT_ID,
      profile_id: profileId,
      name,
      session_id: sessionId,
      device_id: deviceId,
      created_at: timeAgo(daysBack, minutesOffset),
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

  // Events
  // Alice (2 days ago): session_start → page_view → session_end
  // Charlie (5 days ago): session_start → screen_view → page_view → purchase → session_end
  // Bob: no events (inactive)
  //
  // Charlie's expected metrics:
  //   sessions=1, screenViews=1, totalEvents=5
  //   conversionEvents=2 (page_view + purchase; excludes session_start/screen_view/session_end)
  await client.insert({
    table: 'openpanel.events',
    values: [
      // Alice — events spaced 2 minutes apart so timestamps are strictly increasing
      event('00000000-0000-0000-0000-000000000001', 'session_start', 'profile-alice', 'sess-alice-1', 'dev-alice', 2, {}, 4),
      event('00000000-0000-0000-0000-000000000002', 'page_view',     'profile-alice', 'sess-alice-1', 'dev-alice', 2, { path: '/home', browser: 'Chrome' }, 2),
      event('00000000-0000-0000-0000-000000000003', 'session_end',   'profile-alice', 'sess-alice-1', 'dev-alice', 2, { duration: 120000 }, 0),
      // Charlie — events spaced 5 minutes apart so windowFunnel strict_increase works
      event('00000000-0000-0000-0000-000000000004', 'session_start', 'profile-charlie', 'sess-charlie-1', 'dev-charlie', 5, { browser: 'Firefox' }, 20),
      event('00000000-0000-0000-0000-000000000005', 'screen_view',   'profile-charlie', 'sess-charlie-1', 'dev-charlie', 5, { path: '/shop', browser: 'Firefox' }, 15),
      event('00000000-0000-0000-0000-000000000006', 'page_view',     'profile-charlie', 'sess-charlie-1', 'dev-charlie', 5, { path: '/shop', browser: 'Firefox' }, 10),
      event('00000000-0000-0000-0000-000000000007', 'purchase',      'profile-charlie', 'sess-charlie-1', 'dev-charlie', 5, { path: '/checkout', revenue: 9900, browser: 'Firefox' }, 5),
      event('00000000-0000-0000-0000-000000000008', 'session_end',   'profile-charlie', 'sess-charlie-1', 'dev-charlie', 5, { duration: 300000, browser: 'Firefox' }, 0),
    ],
    format: 'JSONEachRow',
  });

  // Sessions (sign=1 = active row, sign=-1 = collapsed)
  await client.insert({
    table: 'openpanel.sessions',
    values: [
      {
        id: 'sess-alice-1',
        project_id: TEST_PROJECT_ID,
        profile_id: 'profile-alice',
        device_id: 'dev-alice',
        created_at: daysAgo(2),
        ended_at: daysAgo(2),
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
      },
      {
        id: 'sess-charlie-1',
        project_id: TEST_PROJECT_ID,
        profile_id: 'profile-charlie',
        device_id: 'dev-charlie',
        created_at: daysAgo(5),
        ended_at: daysAgo(5),
        is_bounce: false,
        entry_origin: 'https://example.com',
        entry_path: '/shop',
        exit_origin: 'https://example.com',
        exit_path: '/checkout',
        screen_view_count: 2,
        revenue: 9900,
        event_count: 2,
        duration: 300,
        country: 'US',
        region: '',
        city: '',
        device: 'desktop',
        brand: '',
        model: '',
        browser: 'Firefox',
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
      },
      {
        id: 'sess-charlie-2',
        project_id: TEST_PROJECT_ID,
        profile_id: 'profile-charlie',
        device_id: 'dev-charlie',
        created_at: daysAgo(10),
        ended_at: daysAgo(10),
        is_bounce: true,
        entry_origin: 'https://example.com',
        entry_path: '/shop',
        exit_origin: 'https://example.com',
        exit_path: '/shop',
        screen_view_count: 1,
        revenue: 0,
        event_count: 1,
        duration: 15,
        country: 'US',
        region: '',
        city: '',
        device: 'desktop',
        brand: '',
        model: '',
        browser: 'Firefox',
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
      },
    ],
    format: 'JSONEachRow',
  });

  await client.close();
}

export async function teardown() {
  const client = await getClient();
  await cleanTestData(client);
  await client.close();
}

async function cleanTestData(client: Awaited<ReturnType<typeof getClient>>) {
  await Promise.all([
    client.command({
      query: `DELETE FROM openpanel.profiles WHERE project_id = '${TEST_PROJECT_ID}'`,
    }),
    client.command({
      query: `DELETE FROM openpanel.events WHERE project_id = '${TEST_PROJECT_ID}'`,
    }),
    client.command({
      query: `DELETE FROM openpanel.sessions WHERE project_id = '${TEST_PROJECT_ID}'`,
    }),
  ]);
}
