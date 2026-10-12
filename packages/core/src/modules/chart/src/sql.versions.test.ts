// The profile joins no longer read `profiles FINAL`: every statement groups
// the raw rows by id and takes each column from the newest version. These
// run against profiles with several unmerged versions (test/profile-versions)
// and assert the latest version is what every chart shape sees — the stale
// version with plan=pro must never match, the other project must never leak.

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { sql } from '@openpanel/db/src/clickhouse/sql';
import { timeAgo } from '../../../../../../test/fixtures';
import {
  setupProfileVersions,
  teardownProfileVersions,
  VERSIONED,
} from '../../../../../../test/profile-versions';
import { expectSameRows, fetchRows } from '../../../../test/clickhouse-rows';
import type {
  IChartBreakdown,
  IChartEvent,
} from '../../report/report.constants';
import { compiledText } from './compiled';
import { conversionQuery } from './conversion.sql';
import {
  getProfilePropertySelect,
  getSelectPropertyKey,
  profileIdsInWindow,
} from './field-resolution';
import { funnelBase, funnelChartQuery } from './funnel.sql';
import {
  aggregateChartQuery,
  chartBucketProfilesQuery,
  chartSeriesQuery,
  profileCte,
  profilePropertyValuesQuery,
} from './sql';

const PROJECT_ID = 'chart-profile-versions';
const DAY_MS = 24 * 60 * 60 * 1000;
const PLAN = 'profile.properties.plan';
const planFilter = (value: string[]) => ({
  id: 'f',
  name: PLAN,
  operator: 'is' as const,
  value,
});

let ch: typeof import('@openpanel/db/src/clickhouse/client').ch;
let now: Date;
let window: { startDate: string; endDate: string };

const event = (overrides: Partial<IChartEvent> = {}): IChartEvent => ({
  id: 'A',
  name: 'screen_view',
  segment: 'event',
  filters: [],
  ...overrides,
});
const breakdown = (name: string): IChartBreakdown => ({ id: name, name });
const resolved = (breakdowns: IChartBreakdown[]) => ({
  breakdowns,
  allCohorts: [],
  cohortMetadata: new Map(),
  projectId: PROJECT_ID,
});

type Row = Record<string, string | number | string[]>;
async function rows(fragment: Parameters<typeof fetchRows>[1]): Promise<Row[]> {
  return (await fetchRows(ch, fragment)).map((row) => JSON.parse(row));
}
function countsBy(result: Row[], label: string): Record<string, number> {
  const counts: Record<string, number> = {};
  // WITH FILL pads a series with zero rows that carry no label.
  for (const row of result.filter((row) => Number(row.count) > 0)) {
    const key = String(row[label]);
    counts[key] = (counts[key] ?? 0) + Number(row.count);
  }
  return counts;
}

beforeAll(async () => {
  ({ ch } = await import('@openpanel/db/src/clickhouse/client'));
  const { bootstrapTestDatabases } = await import(
    '../../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();
  now = await setupProfileVersions(PROJECT_ID);
  window = { startDate: timeAgo(now, 7), endDate: timeAgo(now, 0) };
}, 30_000);

afterAll(() => teardownProfileVersions(PROJECT_ID));

describe('the chart profile CTE', () => {
  it('matches the FINAL form it replaced, row for row', async () => {
    const activeProfiles = () =>
      profileIdsInWindow({
        projectId: PROJECT_ID,
        eventNames: ['screen_view'],
        window: [
          sql`created_at >= toDateTime(${sql.string(window.startDate)})`,
        ],
      });
    const reference = sql`SELECT id as "profile.id", properties['plan'] as ${compiledText('`profile.properties.plan`')}, email as "profile.email", last_seen_at as "profile.last_seen_at"
      FROM profiles FINAL WHERE project_id = ${sql.string(PROJECT_ID)} AND ${activeProfiles()}`;
    const candidate = profileCte(
      [
        sql`id as "profile.id"`,
        sql`argMax(properties['plan'], last_seen_at) as ${compiledText('`profile.properties.plan`')}`,
        sql`argMax(email, last_seen_at) as "profile.email"`,
        sql`max(last_seen_at) as "profile.last_seen_at"`,
      ],
      PROJECT_ID,
      activeProfiles()
    );
    const result = await expectSameRows(ch, reference, candidate, 3);
    const multi = result
      .map((row) => JSON.parse(row))
      .find((row) => row['profile.id'] === VERSIONED.multi);
    expect(multi).toMatchObject({
      'profile.properties.plan': 'team',
      'profile.email': 'mia@new.example',
    });
  });
});

describe('aggregate and series charts', () => {
  it('breaks events down by the latest plan', async () => {
    const result = await rows(
      aggregateChartQuery({
        ...resolved([breakdown(PLAN)]),
        event: event(),
        ...window,
      })
    );
    expect(countsBy(result, 'label_1')).toEqual({ team: 3, free: 1, pro: 1 });
  });

  it('filters on the latest plan, not a stale version', async () => {
    const result = await rows(
      aggregateChartQuery({
        ...resolved([]),
        event: event({ filters: [planFilter(['pro'])] }),
        ...window,
      })
    );
    expect(countsBy(result, 'label_0')).toEqual({ screen_view: 1 });
  });

  it('reads top-level columns from the latest version', async () => {
    const result = await rows(
      aggregateChartQuery({
        ...resolved([breakdown('profile.email')]),
        event: event(),
        ...window,
      })
    );
    expect(countsBy(result, 'label_1')).toEqual({
      'mia@new.example': 3,
      'sam@example.com': 1,
      'uno@example.com': 1,
    });
  });

  it('selects the whole map from the latest version for wildcard refs', async () => {
    const statement = aggregateChartQuery({
      ...resolved([breakdown('profile.properties.experiments.*.name')]),
      event: event(),
      ...window,
    });
    expect(statement.toStatement().query).toContain(
      'argMax(properties, last_seen_at) as "profile.properties"'
    );
    const result = await rows(statement);
    expect(countsBy(result, 'label_0')).toEqual({ screen_view: 5 });
  });

  it('series totals agree with the aggregate', async () => {
    const result = await rows(
      chartSeriesQuery({
        ...resolved([breakdown(PLAN)]),
        event: event({ segment: 'user' }),
        interval: 'day',
        timezone: 'UTC',
        ...window,
      })
    );
    expect(countsBy(result, 'label_1')).toEqual({ team: 3, free: 1, pro: 1 });
  });
});

describe('drill-down, funnel and conversion', () => {
  it('drill-down resolves the bucket against the latest plan', async () => {
    const bucket = (daysAgo: number, plan: string) =>
      rows(
        chartBucketProfilesQuery({
          projectId: PROJECT_ID,
          bucketDate: timeAgo(now, daysAgo),
          interval: 'day',
          event: { name: 'screen_view', filters: [] },
          breakdowns: { [PLAN]: plan },
          limit: 10,
        })
      );
    expect((await bucket(1, 'team')).map((row) => row.profile_id)).toEqual([
      VERSIONED.multi,
    ]);
    expect((await bucket(5, 'pro')).map((row) => row.profile_id)).toEqual([
      VERSIONED.single,
    ]);
    expect(await bucket(4, 'pro')).toEqual([]);
  });

  it('funnel breaks down by the latest plan', async () => {
    const base = funnelBase({
      projectId: PROJECT_ID,
      ...window,
      eventSeries: [event(), event({ id: 'B', name: 'signup' })],
      breakdowns: [breakdown(PLAN)],
      funnelWindowMilliseconds: 7 * DAY_MS,
      group: 'profile_id',
      cohortMetadata: new Map(),
      timezone: 'UTC',
    });
    const result = await rows(funnelChartQuery(base));
    expect(
      result.map((row) => `${row.b_0}:${row.level}:${row.count}`).sort()
    ).toEqual(['free:1:1', 'pro:2:1', 'team:2:1']);
  });

  it('conversion breaks down by the latest plan', async () => {
    const expression = getSelectPropertyKey(PLAN, PROJECT_ID);
    const result = await rows(
      conversionQuery({
        projectId: PROJECT_ID,
        ...window,
        interval: 'day',
        group: 'profile_id',
        funnelWindowSeconds: 7 * 24 * 3600,
        firstEventName: 'screen_view',
        secondEventName: 'signup',
        firstEventWhere: null,
        secondEventWhere: null,
        breakdownSelects: [sql`${expression} as b_0`],
        breakdownExpressions: [expression],
        profileJoinFields: ['id', 'properties'],
        needsGroupArrayJoin: false,
        cohortJoins: [],
      })
    );
    const byPlan: Record<string, [number, number]> = {};
    for (const row of result) {
      const plan = String(row.b_0);
      const [first, converted] = byPlan[plan] ?? [0, 0];
      byPlan[plan] = [
        first + Number(row.total_first),
        converted + Number(row.conversions),
      ];
    }
    expect(byPlan).toEqual({ team: [1, 1], pro: [1, 1], free: [1, 0] });
  });
});

describe('profile property autocomplete', () => {
  it('lists the latest values, newest profile first, like FINAL did', async () => {
    const expression = getProfilePropertySelect(PLAN);
    const reference = sql`SELECT distinct ${expression} as values FROM profiles FINAL WHERE project_id = ${sql.string(PROJECT_ID)} AND ${expression} != '' AND ${expression} IS NOT NULL ORDER BY created_at DESC LIMIT 500`;
    const expected = await rows(reference);
    const actual = await rows(
      profilePropertyValuesQuery(PROJECT_ID, expression)
    );
    expect(actual.map((row) => row.values)).toEqual(
      expected.map((row) => row.values)
    );
    expect(actual.map((row) => row.values).sort()).toEqual([
      'free',
      'pro',
      'team',
    ]);
  });
});
