import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createClient } from '@openpanel/db/src/clickhouse/client';
import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import {
  clickhouseUrl,
  TEST_CLICKHOUSE_DATABASE,
  TEST_CLICKHOUSE_URL,
} from '../../../test/databases';
import { conversionQuery } from '../src/modules/chart/src/conversion.sql';
import {
  funnelBase,
  funnelChartQuery,
} from '../src/modules/chart/src/funnel.sql';
import { sankeySessionPathsQuery } from '../src/modules/chart/src/sankey.sql';
import {
  metricsWithPageFilterQuery,
  topEntriesQuery,
  transitionsQuery,
} from '../src/modules/overview/src/overview.sql';
import { topPagesQuery } from '../src/modules/overview/src/pages.sql';

const database = `${TEST_CLICKHOUSE_DATABASE}_sessionless_${crypto.randomUUID().replaceAll('-', '')}`;
const admin = createClient({ url: TEST_CLICKHOUSE_URL });
const ch = createClient({ url: clickhouseUrl(database) });
const window = {
  projectId: 'sessionless-regression',
  startDate: '2026-08-01 00:00:00',
  endDate: '2026-08-01 23:59:59',
};
const ORIGIN = 'https://example.com';

/** Separate profiles deliberately share only the empty session sentinel. */
function event(
  name: string,
  session: string,
  profile: string,
  seconds: number,
  path = ''
) {
  return {
    project_id: window.projectId,
    name,
    session_id: session,
    profile_id: profile,
    created_at: new Date(Date.UTC(2026, 7, 1) + seconds * 1000)
      .toISOString()
      .replace('T', ' ')
      .replace('Z', ''),
    origin: ORIGIN,
    path,
    properties: {},
    groups: [],
  };
}

beforeAll(async () => {
  await admin.command({
    query: 'CREATE DATABASE {database:Identifier}',
    query_params: { database },
  });
  await ch.command({
    query: `CREATE TABLE events (
    project_id String, name String, session_id String, profile_id String,
    created_at DateTime64(3, 'UTC'), origin String, path String,
    properties Map(String, String), groups Array(String)
  ) ENGINE = Memory`,
  });
  await ch.command({
    query: `CREATE TABLE sessions (
    id String, project_id String, created_at DateTime64(3, 'UTC'),
    is_bounce Bool, sign Int8, version UInt64
  ) ENGINE = VersionedCollapsingMergeTree(sign, version) ORDER BY (project_id, id)`,
  });
  await ch.insert({
    table: 'events',
    format: 'JSONEachRow',
    values: [
      event('begin', 'browser-1', 'visitor-1', 0),
      event('screen_view', 'browser-1', 'visitor-1', 1, '/entry'),
      event('screen_view', 'browser-1', 'visitor-1', 61, '/next'),
      event('finish', 'browser-1', 'visitor-1', 120),
      event('begin', 'browser-2', 'visitor-2', 30),
      event('screen_view', 'browser-2', 'visitor-2', 31, '/lonely'),
      event('begin', '', 'server-a', 10),
      event('screen_view', '', 'server-a', 11, '/fake-entry'),
      event('finish', '', 'server-b', 20),
      event('screen_view', '', 'server-b', 191, '/fake-next'),
      event('begin', '', 'server-c', 240),
      event('finish', '', 'server-c', 250),
    ],
  });
});

afterAll(async () => {
  await ch.close();
  await admin.command({
    query: 'DROP DATABASE IF EXISTS {database:Identifier}',
    query_params: { database },
  });
  await admin.close();
});

/** Execute the actual builders with bound parameters rather than matching SQL text. */
async function rows(fragment: SqlFragment): Promise<Record<string, unknown>[]> {
  const result = await ch.query({
    ...fragment.toStatement(),
    format: 'JSONEachRow',
    clickhouse_settings: {
      session_timezone: 'UTC',
      output_format_json_quote_64bit_integers: 0,
    },
  });
  return result.json<Record<string, unknown>>();
}

test.each([
  'session_id',
  'profile_id',
] as const)('funnel grouped by %s does not merge unrelated profiles', async (group) => {
  const result = await rows(
    funnelChartQuery(
      funnelBase({
        ...window,
        group,
        timezone: 'UTC',
        breakdowns: [],
        cohortMetadata: new Map(),
        funnelWindowMilliseconds: 3_600_000,
        eventSeries: ['begin', 'finish'].map((name, index) => ({
          id: String(index),
          type: 'event',
          name,
          segment: 'event',
          filters: [],
        })),
      })
    )
  );
  const count = group === 'session_id' ? 1 : 2;
  expect(result).toEqual([
    { level: 2, count },
    { level: 1, count },
  ]);
});

test.each([
  'session_id',
  'profile_id',
] as const)('conversion grouped by %s retains the intended grouping', async (group) => {
  const result = await rows(
    conversionQuery({
      ...window,
      group,
      interval: 'day',
      funnelWindowSeconds: 3600,
      firstEventMatch: sql`name = 'begin'`,
      secondEventMatch: sql`name = 'finish'`,
      eventNames: ['begin', 'finish'],
      firstEventWhere: null,
      secondEventWhere: null,
      breakdownSelects: [],
      breakdownExpressions: [],
      profileJoinFields: [],
      needsGroupArrayJoin: false,
      cohortJoins: [],
    })
  );
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    total_first: group === 'session_id' ? 2 : 4,
    conversions: group === 'session_id' ? 1 : 2,
    conversion_rate_percentage: 50,
  });
});

test.each([
  'after',
  'before',
  'between',
] as const)('flow %s excludes sessionless paths', async (mode) => {
  const result = await rows(
    sankeySessionPathsQuery({
      ...window,
      mode,
      steps: 8,
      exclude: [],
      startEvent: {
        name: mode === 'before' ? 'finish' : 'begin',
        whereClause: null,
      },
      ...(mode === 'between'
        ? { endEvent: { name: 'finish', whereClause: null } }
        : {}),
    })
  );
  expect(result.map((row) => row.session_id).sort()).toEqual(
    mode === 'after' ? ['browser-1', 'browser-2'] : ['browser-1']
  );
});

test('user journey entries exclude sessionless paths', async () => {
  const input = { ...window, steps: 8, rawFilterWhere: null };
  expect(await rows(topEntriesQuery({ ...input, topEntries: 10 }))).toEqual([
    { entry_page: `${ORIGIN}/entry`, count: 1 },
  ]);
});

test('user journey transitions do not stitch server profiles together', async () => {
  const input = { ...window, steps: 8, rawFilterWhere: null };
  expect(
    await rows(
      transitionsQuery({
        ...input,
        topEntryPages: [`${ORIGIN}/entry`, `${ORIGIN}/fake-entry`],
      })
    )
  ).toEqual([
    { source: `${ORIGIN}/entry`, target: `${ORIGIN}/next`, step: 1, value: 1 },
  ]);
});

test('pages retain sessionless pageviews but give them zero duration', async () => {
  const result = await rows(topPagesQuery(window));
  expect(result.reduce((sum, row) => sum + Number(row.pageviews), 0)).toBe(5);
  expect(result).toHaveLength(5);
  expect(result.find((row) => row.path === '/entry')).toMatchObject({
    pageviews: 1,
    avg_duration: 1,
  });
  for (const path of ['/fake-entry', '/fake-next', '/lonely', '/next']) {
    expect(result.find((row) => row.path === path)).toMatchObject({
      pageviews: 1,
      avg_duration: 0,
    });
  }
});

test.each([
  { paths: ['/entry', '/fake-entry'], views: 2, visitors: 2, duration: 60 },
  { paths: ['/fake-entry', '/fake-next'], views: 2, visitors: 2, duration: 0 },
])('page-filtered metrics retain views and visitors: %j', async ({
  paths,
  views,
  visitors,
  duration,
}) => {
  const result = await rows(
    metricsWithPageFilterQuery({
      ...window,
      interval: 'day',
      rawSessionFilterWhere: null,
      rawEventFilterWhere: sql`path IN ${sql.array('String', paths)}`,
    })
  );
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    total_screen_views: views,
    unique_visitors: visitors,
    avg_session_duration: duration,
  });
});

test('a flood of sessionless views does not become one large user journey', async () => {
  const projectId = `${window.projectId}-bulk`;
  await ch.command({
    query: `INSERT INTO events SELECT {project:String}, 'screen_view', '', concat('server-', toString(number)),
      toDateTime64('2026-08-01 01:00:00', 3, 'UTC') + toIntervalMillisecond(number),
      {origin:String}, concat('/bulk/', toString(number)), map(), [] FROM numbers(100000)`,
    query_params: { project: projectId, origin: ORIGIN },
  });
  expect(
    await rows(
      topEntriesQuery({
        ...window,
        projectId,
        steps: 8,
        rawFilterWhere: null,
        topEntries: 10,
      })
    )
  ).toEqual([]);
});
