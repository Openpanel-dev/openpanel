/**
 * Distribution charts over property values that the shared fixture does not
 * have: non-finite strings.
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
};

type EventSeriesItem = Extract<IChartEventItem, { type: 'event' }>;

const series = (
  name: string,
  aggregation: IPerUserAggregation = 'sum'
): EventSeriesItem => ({
  type: 'event',
  id: 'A',
  name,
  segment: 'event',
  filters: [],
  perUser: { aggregation, property: 'properties.value' },
});

const report = (items: EventSeriesItem[]): IReportInput => ({
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
  service = createChartService(await testServiceDeps(), testServices());

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
});
