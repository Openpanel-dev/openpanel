/**
 * Integration tests for the chart module against the isolated `openpanel_test`
 * databases (pinned by test/preload.ts) — the positive-row counterpart of
 * src/chart.sql.test.ts's EXPLAIN checks, and the one place the cohort and
 * all-cohorts paths run against seeded `cohort_members` + a Postgres cohort.
 *
 * Fixture (test/fixtures.ts, seeded per suite under its own project id so it
 * can run concurrently with V1's suites): Alice — 3 events 2 days ago
 * (Chrome, page_view /home); Charlie — 5 events 5 days ago (Firefox,
 * screen_view + page_view /shop, purchase 9900); Bob — no events. This suite
 * adds one static cohort ("Firefox users") holding Charlie.
 */

import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import type { IChartEventItem, IReportInput } from '../report/report.constants';

const TEST_PROJECT_ID = 'chart-integration-test';
const TEST_ORG_ID = 'chart-integration-org';
const COHORT_ID = 'dddddddd-0000-4000-8000-000000000001';
const COHORT_NAME = 'Firefox users';
const DAY_MS = 24 * 60 * 60 * 1000;
const PROJECT_CARD_DAYS = 90;

// Bypass Redis caching so a stale entry from another run cannot gate an
// assertion. Captured before mock.module runs — see mcp's tools.test.ts.
const actualRedis = await import('@openpanel/redis');
mock.module('@openpanel/redis', () => ({
  ...actualRedis,
  getCache: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
}));

let FIXTURE: typeof import('../../../../../test/fixtures').FIXTURE;
let service: ReturnType<typeof import('./chart.service').createChartService>;
let ch: typeof import('@openpanel/db/src/clickhouse/client').ch;

type EventSeriesItem = Extract<IChartEventItem, { type: 'event' }>;

const pageView = (
  overrides: Partial<EventSeriesItem> = {}
): EventSeriesItem => ({
  type: 'event',
  id: 'A',
  name: 'page_view',
  segment: 'event',
  filters: [],
  ...overrides,
});

const report = (overrides: Partial<IReportInput> = {}): IReportInput => ({
  projectId: TEST_PROJECT_ID,
  chartType: 'linear',
  interval: 'day',
  series: [pageView()],
  breakdowns: [],
  range: '30d',
  previous: false,
  metric: 'sum',
  ...overrides,
});

beforeAll(async () => {
  const fixtures = await import('../../../../../test/fixtures');
  FIXTURE = fixtures.FIXTURE;
  ({ ch } = await import('@openpanel/db/src/clickhouse/client'));
  const { testServiceDeps, testServices } = await import(
    '../../../test/service-deps'
  );
  const { createChartService } = await import('./chart.service');
  service = createChartService(await testServiceDeps(), testServices());

  const { bootstrapTestDatabases } = await import(
    '../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();
  await fixtures.setupPostgresFixtures(TEST_PROJECT_ID, TEST_ORG_ID);
  await fixtures.setupFixtures(TEST_PROJECT_ID);

  const { db } = await import('@openpanel/db/src/prisma-client');
  await db.cohort.upsert({
    where: { id: COHORT_ID },
    create: {
      id: COHORT_ID,
      name: COHORT_NAME,
      projectId: TEST_PROJECT_ID,
      isStatic: true,
    },
    update: { name: COHORT_NAME, projectId: TEST_PROJECT_ID },
  });
  await ch.command({
    query: `DELETE FROM cohort_members WHERE project_id = '${TEST_PROJECT_ID}'`,
  });
  await ch.insert({
    table: 'cohort_members',
    values: [
      {
        project_id: TEST_PROJECT_ID,
        cohort_id: COHORT_ID,
        profile_id: FIXTURE.profiles.charlie,
        matching_properties: {},
        version: 1,
      },
    ],
    format: 'JSONEachRow',
  });
}, 30_000);

afterAll(async () => {
  const fixtures = await import('../../../../../test/fixtures');
  const { db } = await import('@openpanel/db/src/prisma-client');
  await ch.command({
    query: `DELETE FROM cohort_members WHERE project_id = '${TEST_PROJECT_ID}'`,
  });
  await db.cohort.deleteMany({ where: { id: COHORT_ID } });
  await fixtures.teardownFixtures(TEST_PROJECT_ID);
  await fixtures.teardownPostgresFixtures(TEST_PROJECT_ID, TEST_ORG_ID);
});

function seriesNamed<TSerie extends { names: string[] }>(
  chart: { series: TSerie[] },
  label: string
): TSerie | undefined {
  return chart.series.find((serie) => serie.names.includes(label));
}

describe('executeChart', () => {
  it('counts both page views over the last 30 days', async () => {
    const chart = await service.execute(report());

    expect(chart.series).toHaveLength(1);
    expect(chart.series[0]?.names).toEqual(['page_view']);
    expect(chart.metrics.sum).toBe(2);
    expect(
      chart.series[0]?.data.filter((point) => point.count > 0)
    ).toHaveLength(2);
  });

  it('breaks down by browser', async () => {
    const chart = await service.execute(
      report({ breakdowns: [{ id: 'b', name: 'browser' }] })
    );

    expect(seriesNamed(chart, 'Chrome')?.metrics.sum).toBe(1);
    expect(seriesNamed(chart, 'Firefox')?.metrics.sum).toBe(1);
    expect(seriesNamed(chart, 'Chrome')?.event.breakdowns).toEqual({
      browser: 'Chrome',
    });
  });

  it('filters on cohort membership (inCohort / notInCohort)', async () => {
    const inCohort = await service.execute(
      report({
        series: [
          pageView({
            filters: [
              {
                id: 'c',
                name: 'cohort',
                operator: 'inCohort',
                value: [],
                cohortIds: [COHORT_ID],
              },
            ],
          }),
        ],
      })
    );
    const notInCohort = await service.execute(
      report({
        series: [
          pageView({
            filters: [
              {
                id: 'c',
                name: 'cohort',
                operator: 'notInCohort',
                value: [],
                cohortIds: [COHORT_ID],
              },
            ],
          }),
        ],
      })
    );

    expect(inCohort.metrics.sum).toBe(1);
    expect(notInCohort.metrics.sum).toBe(1);
  });

  it('breaks down by a single cohort and by all cohorts', async () => {
    const single = await service.execute(
      report({ breakdowns: [{ id: 'b', name: `cohort:${COHORT_ID}` }] })
    );
    const all = await service.execute(
      report({ breakdowns: [{ id: 'b', name: 'cohort' }] })
    );

    // Alice is outside the cohort, Charlie inside — both rows must survive.
    expect(single.metrics.sum).toBe(2);
    expect(single.series).toHaveLength(2);
    // All-cohorts is an INNER JOIN on membership (V1): non-members drop out.
    expect(all.series.map((serie) => [serie.names, serie.metrics.sum])).toEqual(
      [[['page_view', COHORT_NAME], 1]]
    );
  });

  it('narrows profile properties into the profile CTE and still matches', async () => {
    const chart = await service.execute(
      report({
        series: [
          pageView({
            filters: [
              {
                id: 'p',
                name: 'profile.properties.browser',
                operator: 'is',
                value: ['Firefox'],
              },
            ],
          }),
        ],
        breakdowns: [{ id: 'b', name: 'profile.properties.country' }],
      })
    );

    expect(chart.metrics.sum).toBe(1);
    expect(seriesNamed(chart, 'US')?.metrics.sum).toBe(1);
  });
});

describe('executeAggregateChart', () => {
  it('sums revenue per browser without a time axis', async () => {
    const chart = await service.executeAggregate(
      report({
        chartType: 'bar',
        series: [
          {
            type: 'event',
            id: 'A',
            name: 'purchase',
            segment: 'property_sum',
            property: 'revenue',
            filters: [],
          },
        ],
        breakdowns: [{ id: 'b', name: 'browser' }],
      })
    );

    expect(chart.series).toHaveLength(1);
    expect(seriesNamed(chart, 'Firefox')?.metrics.sum).toBe(9900);
    expect(chart.series[0]?.data).toHaveLength(1);
  });
});

describe('picker queries', () => {
  it('lists event names with counts, `*` first', async () => {
    const events = await service.listChartEvents(TEST_PROJECT_ID);

    // Counts come from distinct_event_names_mv (V1): one row per name and
    // insert part, not one per event.
    expect(events[0]?.name).toBe('*');
    expect(events[0]?.count).toBe(
      events.slice(1).reduce((total, event) => total + event.count, 0)
    );
    expect(
      events
        .slice(1)
        .map((event) => event.name)
        .sort()
    ).toEqual([
      'page_view',
      'purchase',
      'screen_view',
      'session_end',
      'session_start',
    ]);
  });

  it('lists filterable properties, `name` only for the wildcard event', async () => {
    const all = await service.listChartProperties({
      projectId: TEST_PROJECT_ID,
      event: '*',
    });
    const single = await service.listChartProperties({
      projectId: TEST_PROJECT_ID,
      event: 'page_view',
    });

    expect(all).toContain('name');
    expect(all).toContain('path');
    expect(all).toContain('profile.email');
    expect(new Set(all).size).toBe(all.length);
    expect(single).not.toContain('name');
  });

  it('lists values for a top-level column, a profile property and has_profile', async () => {
    const path = await service.getChartPropertyValues({
      projectId: TEST_PROJECT_ID,
      event: 'page_view',
      property: 'path',
    });
    const profileBrowser = await service.getChartPropertyValues({
      projectId: TEST_PROJECT_ID,
      event: '*',
      property: 'profile.properties.browser',
    });
    const hasProfile = await service.getChartPropertyValues({
      projectId: TEST_PROJECT_ID,
      event: '*',
      property: 'has_profile',
    });
    const unknown = await service.getChartPropertyValues({
      projectId: TEST_PROJECT_ID,
      event: '*',
      property: 'totally_made_up_column',
    });

    expect(path.values.sort()).toEqual(['/home', '/shop']);
    expect(profileBrowser.values.sort()).toEqual(['Chrome', 'Firefox']);
    expect(hasProfile.values).toEqual(['true', 'false']);
    expect(unknown.values).toEqual([]);
  });
});

describe('getProjectCard', () => {
  it('returns a filled 3-month chart, metrics and a trend', async () => {
    const card = await service.getProjectCard(TEST_PROJECT_ID);

    expect(card.chart.length).toBeGreaterThanOrEqual(PROJECT_CARD_DAYS);
    expect(card.chart[0]?.date).toBeInstanceOf(Date);
    expect(card.metrics?.months_3).toBe(2);
    expect(card.trend.direction).toBe('neutral');
  });
});

describe('getChartBucketProfiles', () => {
  it('returns the profiles behind one data point, honoring breakdowns', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * DAY_MS).toISOString();
    const profiles = await service.bucketProfiles({
      projectId: TEST_PROJECT_ID,
      date: twoDaysAgo,
      interval: 'day',
      series: [pageView()],
      breakdowns: { browser: 'Chrome' },
    });
    const none = await service.bucketProfiles({
      projectId: TEST_PROJECT_ID,
      date: twoDaysAgo,
      interval: 'day',
      series: [pageView()],
      breakdowns: { browser: 'Firefox' },
    });

    expect(profiles.map((profile) => profile.id)).toEqual([
      FIXTURE.profiles.alice,
    ]);
    expect(none).toEqual([]);
  });

  it('selects only whitelisted profile columns for profile.* references', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * DAY_MS).toISOString();
    const profiles = await service.bucketProfiles({
      projectId: TEST_PROJECT_ID,
      date: twoDaysAgo,
      interval: 'day',
      series: [
        pageView({
          filters: [
            {
              id: 'p',
              name: 'profile.email',
              operator: 'is',
              value: ['alice@example.com'],
            },
          ],
        }),
      ],
    });

    expect(profiles.map((profile) => profile.id)).toEqual([
      FIXTURE.profiles.alice,
    ]);
    await expect(
      service.bucketProfiles({
        projectId: TEST_PROJECT_ID,
        date: twoDaysAgo,
        interval: 'day',
        series: [
          pageView({
            filters: [
              {
                id: 'p',
                name: 'profile.evil; DROP TABLE profiles',
                operator: 'is',
                value: ['x'],
              },
            ],
          }),
        ],
      })
    ).rejects.toThrow(/Refusing to inline identifier/);
  });
});
