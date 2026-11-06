/**
 * Distribution charts over property values that the shared fixture does not
 * have: non-finite strings, ranges narrower than the label precision, and
 * several series that have to share one set of bins.
 */

import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { createClient } from '@openpanel/db/src/clickhouse/client';
import { TEST_CLICKHOUSE_URL } from '../../../../../test/databases';
import type {
  IChartEventItem,
  IPerUserAggregation,
  IReportInput,
} from '../report/report.constants';

const PROJECT_ID = 'test-distribution';
const ORG_ID = 'test-distribution-org';
const START = '2024-03-04 00:00:00';
const END = '2024-03-10 23:59:59';
const CREATED_AT = '2024-03-05 10:00:00';

const actualRedis = await import('@openpanel/redis');
mock.module('@openpanel/redis', () => ({
  ...actualRedis,
  getCache: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
}));

/** Event name -> one list of `value` properties per user. */
const VALUES_BY_USER: Record<string, string[][]> = {
  score: [['1'], ['2'], ['5', 'Infinity'], ['inf'], ['nan'], ['-inf']],
  rate: Array.from({ length: 10 }, (_, index) => [`0.10${index}`]),
  order: [['10'], ['100']],
  ticket: [['1000'], ['2000']],
};

type EventSeriesItem = Extract<IChartEventItem, { type: 'event' }>;

const series = (
  name: string,
  aggregation: IPerUserAggregation = 'sum',
  id = 'A'
): EventSeriesItem => ({
  type: 'event',
  id,
  name,
  segment: 'event',
  filters: [],
  perUser: { aggregation, property: 'properties.value' },
});

const report = (items: IChartEventItem[]): IReportInput => ({
  projectId: PROJECT_ID,
  chartType: 'distribution',
  interval: 'day',
  series: items,
  breakdowns: [],
  range: 'custom',
  startDate: START,
  endDate: END,
  previous: false,
  metric: 'sum',
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

  const events = Object.entries(VALUES_BY_USER).flatMap(([name, users]) =>
    users.flatMap((values, user) =>
      values.map((value) =>
        fixtures.buildEvent(
          new Date(),
          PROJECT_ID,
          crypto.randomUUID(),
          name,
          `profile-${name}-${user}`,
          `session-${name}-${user}`,
          0,
          0,
          { created_at: CREATED_AT, properties: { value } }
        )
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
  const fixtures = await import('../../../../../test/fixtures');
  await withClient((client) =>
    client.command({
      query: `DELETE FROM events WHERE project_id = '${PROJECT_ID}'`,
    })
  );
  await fixtures.teardownPostgresFixtures(PROJECT_ID, ORG_ID);
});

describe('distribution over awkward property values', () => {
  it('leaves non-finite values out and keeps the users around them', async () => {
    const chart = await service.execute(report([series('score')]));
    const data = chart.series[0]?.data ?? [];

    expect(chart.series[0]?.metrics.sum).toBe(3);
    expect(data[0]).toEqual({ date: '1 - 1.4', count: 1 });
    expect(data[9]).toEqual({ date: '4.6 - 5', count: 1 });
  });

  it('keeps every bin of a range narrower than two decimals', async () => {
    const chart = await service.execute(report([series('rate', 'avg')]));
    const data = chart.series[0]?.data ?? [];

    expect(data).toHaveLength(10);
    expect(new Set(data.map((point) => point.date)).size).toBe(10);
    expect(chart.series[0]?.metrics.sum).toBe(10);
    expect(chart.series[0]?.metrics.count).toBe(10);
  });
});

describe('distribution with several series', () => {
  const orderAndTicket = [series('order'), series('ticket', 'sum', 'B')];
  const bucketsOf = (
    chart: Awaited<ReturnType<typeof service.execute>>,
    name: string
  ) =>
    chart.series
      .find((serie) => serie.names.some((part) => part.includes(name)))
      ?.data.map((point) => point.count);

  it('gives every series the same bins over their combined range', async () => {
    const chart = await service.execute(report(orderAndTicket));
    const [first, second] = chart.series.map((serie) =>
      serie.data.map((point) => point.date)
    );

    expect(second).toEqual(first);
    expect(first?.[0]).toBe('10 - 209');
    expect(first?.[9]).toBe('1801 - 2000');
    expect(bucketsOf(chart, 'order')).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(bucketsOf(chart, 'ticket')).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('keeps breakdown series on the shared bins', async () => {
    const chart = await service.execute({
      ...report(orderAndTicket),
      breakdowns: [{ id: '1', name: 'properties.value' }],
    });
    const labels = chart.series.map((serie) =>
      serie.data.map((point) => point.date).join()
    );

    expect(chart.series).toHaveLength(4);
    expect(new Set(labels).size).toBe(1);
  });

  it('adds series up bucket by bucket in a formula', async () => {
    const chart = await service.execute(
      report([
        ...orderAndTicket,
        { type: 'formula', id: 'C', formula: 'A+B', displayName: 'both' },
      ])
    );

    expect(bucketsOf(chart, 'both')).toEqual([2, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('still answers for a report that mixes counts and binned values', async () => {
    const chart = await service.execute(
      report([
        series('order'),
        { ...series('ticket', 'sum', 'B'), perUser: { aggregation: 'count' } },
      ])
    );

    expect(chart.series).toHaveLength(2);
  });

  it('puts a value outside the shared range into the edge bins', async () => {
    const { getChartSql } = await import('./src/statement');
    const { runQuery } = await import('./src/run-query');
    const statement = await getChartSql(deps, {
      event: series('order'),
      projectId: PROJECT_ID,
      startDate: START,
      endDate: END,
      breakdowns: [],
      interval: 'day',
      chartType: 'distribution',
      metric: 'sum',
      previous: false,
      timezone: 'UTC',
      binRange: { lo: 50, hi: 60 },
    });
    const rows = await runQuery<{ count: number }>(deps, statement, 'UTC');

    expect(rows.map((row) => row.count)).toEqual([
      1, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    ]);
  });
});
