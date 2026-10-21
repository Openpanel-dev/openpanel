/**
 * "First time" series against a hand-built dataset in the isolated
 * `openpanel_test` databases: the positive-row counterpart of the first-time
 * EXPLAIN checks in src/sql.test.ts and src/funnel.sql.test.ts.
 *
 * Range 2024-03-04 .. 2024-03-10.
 *
 *   user  events, in order
 *   uA    signup 03-01 (before the range), landing + signup 03-05
 *   uB    landing + signup 03-05, signup 03-06, signup 03-07
 *   uC    signup 03-05 (mobile), landing + signup 03-06 (web)
 *   uD    landing + signup 03-08 (web)
 *
 * First signups inside the range: uB and uC on 03-05, uD on 03-08. With a
 * `platform = web` filter only uD counts: uC's first signup was on mobile.
 */

import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { createClient } from '@openpanel/db/src/clickhouse/client';
import { TEST_CLICKHOUSE_URL } from '../../../../../test/databases';
import type {
  IChartEventFilter,
  IChartEventItem,
  IReportInput,
} from '../report/report.constants';

const PROJECT_ID = 'test-first-time';
const ORG_ID = 'test-first-time-org';
const START = '2024-03-04 00:00:00';
const END = '2024-03-10 23:59:59';
const FUNNEL_WINDOW_HOURS = 24;

const actualRedis = await import('@openpanel/redis');
mock.module('@openpanel/redis', () => ({
  ...actualRedis,
  getCache: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
}));

type JourneyEvent = [name: string, createdAt: string, platform?: string];
const JOURNEYS: Record<string, JourneyEvent[]> = {
  uA: [
    ['signup', '2024-03-01 10:00:00'],
    ['landing', '2024-03-05 09:00:00'],
    ['signup', '2024-03-05 10:00:00'],
  ],
  uB: [
    ['landing', '2024-03-05 09:00:00'],
    ['signup', '2024-03-05 10:00:00'],
    ['signup', '2024-03-06 10:00:00'],
    ['signup', '2024-03-07 10:00:00'],
  ],
  uC: [
    ['signup', '2024-03-05 10:00:00', 'mobile'],
    ['landing', '2024-03-06 09:00:00'],
    ['signup', '2024-03-06 10:00:00', 'web'],
  ],
  uD: [
    ['landing', '2024-03-08 09:00:00'],
    ['signup', '2024-03-08 10:00:00', 'web'],
  ],
};

const WEB_ONLY: IChartEventFilter[] = [
  { id: 'p', name: 'properties.platform', operator: 'is', value: ['web'] },
];

type EventSeriesItem = Extract<IChartEventItem, { type: 'event' }>;

const signup = (overrides: Partial<EventSeriesItem> = {}): EventSeriesItem => ({
  type: 'event',
  id: 'A',
  name: 'signup',
  segment: 'event',
  filters: [],
  ...overrides,
});

const report = (overrides: Partial<IReportInput> = {}): IReportInput => ({
  projectId: PROJECT_ID,
  chartType: 'linear',
  interval: 'day',
  series: [signup()],
  breakdowns: [],
  range: 'custom',
  startDate: START,
  endDate: END,
  previous: false,
  metric: 'sum',
  ...overrides,
});

let service: ReturnType<typeof import('./chart.service').createChartService>;
let deps: import('../../services').ServiceDeps;

async function withClient<T>(
  run: (client: ReturnType<typeof createClient>) => Promise<T>
): Promise<T> {
  const client = createClient({ url: TEST_CLICKHOUSE_URL });
  try {
    return await run(client);
  } finally {
    await client.close();
  }
}

beforeAll(async () => {
  const { bootstrapTestDatabases } = await import(
    '../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();
  const fixtures = await import('../../../../../test/fixtures');
  await fixtures.setupPostgresFixtures(PROJECT_ID, ORG_ID);
  const { testServiceDeps, testServices } = await import(
    '../../../test/service-deps'
  );
  const { createChartService } = await import('./chart.service');
  deps = await testServiceDeps();
  service = createChartService(deps, testServices());

  const events = Object.entries(JOURNEYS).flatMap(([user, journey]) =>
    journey.map(([name, createdAt, platform]) =>
      fixtures.buildEvent(
        new Date(),
        PROJECT_ID,
        crypto.randomUUID(),
        name,
        `profile-${user}`,
        `session-${user}`,
        0,
        0,
        {
          created_at: createdAt,
          properties: platform ? { platform } : {},
        }
      )
    )
  );
  await withClient(async (client) => {
    await client.command({
      query: `DELETE FROM events WHERE project_id = '${PROJECT_ID}'`,
    });
    await client.insert({
      table: 'events',
      values: events,
      format: 'JSONEachRow',
    });
  });
}, 30_000);

afterAll(async () => {
  await withClient((client) =>
    client.command({
      query: `DELETE FROM events WHERE project_id = '${PROJECT_ID}'`,
    })
  );
  const fixtures = await import('../../../../../test/fixtures');
  await fixtures.teardownPostgresFixtures(PROJECT_ID, ORG_ID);
});

function countsByDay(chart: Awaited<ReturnType<typeof service.execute>>) {
  return Object.fromEntries(
    (chart.series[0]?.data ?? [])
      .filter((point) => point.count > 0)
      .map((point) => [point.date.slice(0, 10), point.count])
  );
}

describe('first time series', () => {
  it('counts every signup without the qualifier', async () => {
    const chart = await service.execute(report());
    expect(chart.metrics.sum).toBe(7);
  });

  it("counts only each user's first-ever signup, once", async () => {
    const chart = await service.execute(
      report({ series: [signup({ firstTime: true })] })
    );
    expect(countsByDay(chart)).toEqual({ '2024-03-05': 2, '2024-03-08': 1 });
  });

  it('does not count a later match when the first occurrence fails a filter', async () => {
    const plain = await service.execute(
      report({ series: [signup({ filters: WEB_ONLY })] })
    );
    const firstTime = await service.execute(
      report({ series: [signup({ filters: WEB_ONLY, firstTime: true })] })
    );
    expect(plain.metrics.sum).toBe(2);
    expect(countsByDay(firstTime)).toEqual({ '2024-03-08': 1 });
  });

  it('counts unique users and the aggregate chart the same way', async () => {
    const users = await service.execute(
      report({ series: [signup({ segment: 'user', firstTime: true })] })
    );
    const aggregate = await service.executeAggregate(
      report({ chartType: 'bar', series: [signup({ firstTime: true })] })
    );
    expect(countsByDay(users)).toEqual({ '2024-03-05': 2, '2024-03-08': 1 });
    expect(aggregate.metrics.sum).toBe(3);
  });

  it('lists the users of a drill-down bucket', async () => {
    const { chartBucketProfilesQuery } = await import('./src/sql');
    const statement = chartBucketProfilesQuery({
      projectId: PROJECT_ID,
      bucketDate: '2024-03-05 00:00:00',
      interval: 'day',
      event: { name: 'signup', filters: [], firstTime: true },
      breakdowns: {},
      limit: 10,
    }).toStatement();
    const rows = await withClient(async (client) => {
      const result = await client.query({
        ...statement,
        format: 'JSONEachRow',
      });
      return result.json<{ profile_id: string }>();
    });
    expect(rows.map((row) => row.profile_id).sort()).toEqual([
      'profile-uB',
      'profile-uC',
    ]);
  });
});

describe('first time funnel and conversion steps', () => {
  const steps = (firstTimeSignup: boolean): EventSeriesItem[] => [
    signup({ id: '1', name: 'landing' }),
    signup({ id: '2', firstTime: firstTimeSignup }),
  ];

  async function funnelCounts(firstTimeSignup: boolean) {
    const { getFunnel } = await import('./funnel.service');
    const result = await getFunnel(deps, {
      projectId: PROJECT_ID,
      startDate: START,
      endDate: END,
      timezone: 'UTC',
      series: steps(firstTimeSignup),
      breakdowns: [],
      chartType: 'funnel',
      interval: 'day',
      range: 'custom',
      previous: false,
      metric: 'sum',
      options: {
        type: 'funnel',
        funnelWindow: FUNNEL_WINDOW_HOURS,
        funnelGroup: 'profile_id',
      },
    });
    return result[0]?.steps.map((step) => step.count);
  }

  async function conversionTotals(firstTimeSignup: boolean) {
    const { getConversion } = await import('./conversion.service');
    const series = await getConversion(deps, {
      projectId: PROJECT_ID,
      startDate: START,
      endDate: END,
      timezone: 'UTC',
      interval: 'day',
      series: steps(firstTimeSignup),
      breakdowns: [],
      options: {
        type: 'funnel',
        funnelWindow: FUNNEL_WINDOW_HOURS,
        funnelGroup: 'profile_id',
      },
    });
    const points = series.flatMap((serie) => serie.data);
    return {
      total: points.reduce((sum, point) => sum + Number(point.total), 0),
      conversions: points.reduce(
        (sum, point) => sum + Number(point.conversions),
        0
      ),
    };
  }

  it('reaches a first-time step only at the first occurrence', async () => {
    // uA's and uC's signups after landing are not their first.
    expect(await funnelCounts(false)).toEqual([4, 4]);
    expect(await funnelCounts(true)).toEqual([4, 2]);
  });

  it('converts into a first-time step only at the first occurrence', async () => {
    expect(await conversionTotals(false)).toEqual({ total: 4, conversions: 4 });
    expect(await conversionTotals(true)).toEqual({ total: 4, conversions: 2 });
  });
});
