/**
 * "View users" on a chart point: every bucket a time-series chart draws must
 * hand back the users it counted, whatever the interval and the organization's
 * timezone. The chart buckets in the organization's timezone with weeks starting
 * on Monday, so the drill-down has to resolve the point's date the same way.
 *
 * Events, in UTC:
 *
 *   user      created_at            New York            Kolkata
 *   sunday    2024-03-10 15:00:00   Sunday 03-10 11:00  Sunday 03-10 20:30
 *   monday    2024-03-11 01:30:00   Sunday 03-10 21:30  Monday 03-11 07:00
 *   tuesday   2024-03-12 15:45:00   Tuesday 03-12 11:45 Tuesday 03-12 21:15
 *   newMonth  2024-04-01 02:00:00   Sunday 03-31 22:00  Monday 04-01 07:30
 */

import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { createClient } from '@openpanel/db/src/clickhouse/client';
import { TEST_CLICKHOUSE_URL } from '../../../../../test/databases';
import type { IChartEventItem, IReportInput } from '../report/report.constants';

// The api runs under UTC (apps/api/src/main.ts) and reads a point's date in it.
process.env.TZ = 'UTC';

const ORG_ID_PREFIX = 'test-bucket-profiles-org';
const PROJECT_ID_PREFIX = 'test-bucket-profiles';
const TIMEZONES = ['UTC', 'America/New_York', 'Asia/Kolkata'] as const;
const INTERVALS = ['hour', 'day', 'week', 'month'] as const;

const actualRedis = await import('@openpanel/redis');
mock.module('@openpanel/redis', () => ({
  ...actualRedis,
  getCache: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
}));

const SIGNUPS: Record<string, string> = {
  sunday: '2024-03-10 15:00:00',
  monday: '2024-03-11 01:30:00',
  tuesday: '2024-03-12 15:45:00',
  newMonth: '2024-04-01 02:00:00',
};

const signup: Extract<IChartEventItem, { type: 'event' }> = {
  type: 'event',
  id: 'A',
  name: 'signup',
  segment: 'user',
  filters: [],
};

const projectIdFor = (timezone: string) =>
  `${PROJECT_ID_PREFIX}-${timezone.replace('/', '-').toLowerCase()}`;

const report = (
  timezone: string,
  interval: IReportInput['interval']
): IReportInput => ({
  projectId: projectIdFor(timezone),
  chartType: 'linear',
  interval,
  series: [signup],
  breakdowns: [],
  range: 'custom',
  startDate: '2024-03-01 00:00:00',
  endDate: '2024-04-30 23:59:59',
  previous: false,
  metric: 'sum',
});

let service: ReturnType<typeof import('./chart.service').createChartService>;

beforeAll(async () => {
  const { bootstrapTestDatabases } = await import(
    '../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();
  const fixtures = await import('../../../../../test/fixtures');
  const { db } = await import('@openpanel/db/src/prisma-client');
  const client = createClient({ url: TEST_CLICKHOUSE_URL });
  for (const [index, timezone] of TIMEZONES.entries()) {
    const projectId = projectIdFor(timezone);
    const orgId = `${ORG_ID_PREFIX}-${index}`;
    await fixtures.setupPostgresFixtures(projectId, orgId);
    await db.organization.update({
      where: { id: orgId },
      data: { timezone },
    });
    await client.command({
      query: `DELETE FROM events WHERE project_id = '${projectId}'`,
    });
    await client.command({
      query: `DELETE FROM profiles WHERE project_id = '${projectId}'`,
    });
    await client.insert({
      table: 'events',
      format: 'JSONEachRow',
      values: Object.entries(SIGNUPS).map(([user, createdAt]) =>
        fixtures.buildEvent(
          new Date(),
          projectId,
          crypto.randomUUID(),
          'signup',
          user,
          `session-${user}`,
          0,
          0,
          { created_at: createdAt }
        )
      ),
    });
    await client.insert({
      table: 'profiles',
      format: 'JSONEachRow',
      values: Object.keys(SIGNUPS).map((id) => ({
        id,
        project_id: projectId,
        created_at: '2024-03-01 00:00:00',
      })),
    });
  }
  await client.close();
  const { testServiceDeps, testServices } = await import(
    '../../../test/service-deps'
  );
  const { createChartService } = await import('./chart.service');
  service = createChartService(await testServiceDeps(), testServices());
}, 30_000);

afterAll(async () => {
  const fixtures = await import('../../../../../test/fixtures');
  const client = createClient({ url: TEST_CLICKHOUSE_URL });
  for (const [index, timezone] of TIMEZONES.entries()) {
    const projectId = projectIdFor(timezone);
    await client.command({
      query: `DELETE FROM events WHERE project_id = '${projectId}'`,
    });
    await client.command({
      query: `DELETE FROM profiles WHERE project_id = '${projectId}'`,
    });
    await fixtures.teardownPostgresFixtures(
      projectId,
      `${ORG_ID_PREFIX}-${index}`
    );
  }
  await client.close();
});

/** The chart's non-empty points; the dashboard sends a point's `date` back on a click. */
async function pointsOf(timezone: string, interval: IReportInput['interval']) {
  const chart = await service.execute(report(timezone, interval));
  return (chart.series[0]?.data ?? []).filter((point) => point.count > 0);
}

async function usersBehind(
  timezone: string,
  interval: IReportInput['interval'],
  date: string,
  event = signup
) {
  const profiles = await service.bucketProfiles({
    projectId: projectIdFor(timezone),
    date,
    interval,
    series: [event],
  });
  return profiles.map((profile) => profile.id).sort();
}

describe('chart.bucketProfiles', () => {
  for (const timezone of TIMEZONES) {
    for (const interval of INTERVALS) {
      it(`finds the users of every ${interval} point in ${timezone}`, async () => {
        const points = await pointsOf(timezone, interval);
        expect(points.length).toBeGreaterThan(0);
        const found = await Promise.all(
          points.map((point) => usersBehind(timezone, interval, point.date))
        );
        expect(found.map((users) => users.length)).toEqual(
          points.map((point) => point.count)
        );
        expect(found.flat().sort()).toEqual(Object.keys(SIGNUPS).sort());
      });
    }
  }

  it('reads a day in the organization timezone', async () => {
    const points = await pointsOf('America/New_York', 'day');
    const sunday = points.find((point) => point.date.startsWith('2024-03-10'));
    expect(sunday).toBeDefined();
    expect(
      await usersBehind('America/New_York', 'day', sunday?.date ?? '')
    ).toEqual(['monday', 'sunday']);
  });

  it('starts a week on Monday, as the chart does', async () => {
    const points = await pointsOf('UTC', 'week');
    expect(points.map((point) => point.date.slice(0, 10))).toEqual([
      '2024-03-04',
      '2024-03-11',
      '2024-04-01',
    ]);
    expect(await usersBehind('UTC', 'week', points[1]?.date ?? '')).toEqual([
      'monday',
      'tuesday',
    ]);
  });

  it('keeps first-time users in the same Monday week', async () => {
    const points = await pointsOf('UTC', 'week');
    expect(
      await usersBehind('UTC', 'week', points[1]?.date ?? '', {
        ...signup,
        firstTime: true,
      })
    ).toEqual(['monday', 'tuesday']);
  });
});
