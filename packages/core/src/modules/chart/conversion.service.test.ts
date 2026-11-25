/**
 * Conversion breakdowns against a hand-built dataset: three referrers each
 * convert on each of three days, one conversion per session.
 *
 * The statement orders rows by day, then breakdown, so a limit is reached on
 * the first day and every later day's rows arrive after it.
 */

import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { createClient } from '@openpanel/db/src/clickhouse/client';
import { TEST_CLICKHOUSE_URL } from '../../../../../test/databases';
import type { ConversionChartInput } from './conversion.service';

const PROJECT_ID = 'test-conversion-breakdown';
const ORG_ID = 'test-conversion-breakdown-org';
const DAYS = ['2024-03-04', '2024-03-05', '2024-03-06'];
const REFERRERS = ['alpha', 'beta', 'gamma'];

const actualRedis = await import('@openpanel/redis');
mock.module('@openpanel/redis', () => ({
  ...actualRedis,
  getCache: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
}));

const input = (limit?: number): ConversionChartInput => ({
  projectId: PROJECT_ID,
  interval: 'day',
  series: [
    { type: 'event', id: 'A', name: 'landing', segment: 'event', filters: [] },
    { type: 'event', id: 'B', name: 'signup', segment: 'event', filters: [] },
  ],
  breakdowns: [{ id: 'b', name: 'referrer_name' }],
  startDate: '2024-03-04 00:00:00',
  endDate: '2024-03-06 23:59:59',
  options: { type: 'funnel', funnelGroup: 'session_id', funnelWindow: 24 },
  limit,
  timezone: 'UTC',
});

let getConversion: (
  chart: ConversionChartInput
) => ReturnType<typeof import('./conversion.service').getConversion>;

async function deleteEvents(client: ReturnType<typeof createClient>) {
  await client.command({
    query: `DELETE FROM events WHERE project_id = '${PROJECT_ID}'`,
  });
}

beforeAll(async () => {
  const { bootstrapTestDatabases } = await import(
    '../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();
  const fixtures = await import('../../../../../test/fixtures');
  await fixtures.setupPostgresFixtures(PROJECT_ID, ORG_ID);
  const { testServiceDeps } = await import('../../../test/service-deps');
  const conversion = await import('./conversion.service');
  const deps = await testServiceDeps();
  getConversion = (chart) => conversion.getConversion(deps, chart);

  const events = DAYS.flatMap((day) =>
    REFERRERS.flatMap((referrer) =>
      ['landing', 'signup'].map((name, minute) =>
        fixtures.buildEvent(
          new Date(),
          PROJECT_ID,
          crypto.randomUUID(),
          name,
          `profile-${referrer}-${day}`,
          `session-${referrer}-${day}`,
          0,
          0,
          {
            created_at: `${day} 10:0${minute}:00`,
            referrer_name: referrer,
          }
        )
      )
    )
  );
  const client = createClient({ url: TEST_CLICKHOUSE_URL });
  await deleteEvents(client);
  await client.insert({
    table: 'events',
    values: events,
    format: 'JSONEachRow',
  });
  await client.close();
}, 30_000);

afterAll(async () => {
  const client = createClient({ url: TEST_CLICKHOUSE_URL });
  await deleteEvents(client);
  await client.close();
  const fixtures = await import('../../../../../test/fixtures');
  await fixtures.teardownPostgresFixtures(PROJECT_ID, ORG_ID);
});

describe('getConversion breakdown limit', () => {
  it('keeps every day of a series once the limit is reached', async () => {
    const series = await getConversion(input(2));

    expect(series.map((serie) => serie.id)).toEqual(['alpha', 'beta']);
    for (const serie of series) {
      expect(serie.data.map((point) => point.date.slice(0, 10))).toEqual(DAYS);
      expect(serie.data.map((point) => Number(point.conversions))).toEqual([
        1, 1, 1,
      ]);
    }
  });

  it('returns every series when the limit is above their count', async () => {
    const limited = await getConversion(input(REFERRERS.length));
    const unlimited = await getConversion(input());

    expect(limited.map((serie) => serie.id)).toEqual(REFERRERS);
    expect(unlimited.map((serie) => serie.id)).toEqual(REFERRERS);
    expect(limited).toEqual(unlimited);
  });
});
