import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createClient } from '@openpanel/db/src/clickhouse/client';
import { bootstrapTestDatabases } from '../../../../../test/bootstrap-databases';
import { TEST_CLICKHOUSE_URL } from '../../../../../test/databases';
import { buildEvent } from '../../../../../test/fixtures';
import { testServiceDeps } from '../../../test/service-deps';
import type { ServiceDeps } from '../../services';
import type { IReportInput } from '../report/report.constants';
import { getConversion } from './conversion.service';
import { getFunnel, getFunnelProfileIds } from './funnel.service';

/**
 * Funnel view → add → buy, every event carrying the product `sku`.
 *
 *   user  events, in order                 reached   reached holding sku
 *   u1    view X, add X, buy X             3         3
 *   u2    view X, add Y, buy Y             3         1 (Y was never viewed)
 *   u3    view X, view Y, add Y, buy X     3         2 (Y: view, add)
 *   u4    view X, add X                    2         2
 *   u5    view X                           1         1
 */
const PROJECT_ID = 'test-funnel-hold-properties';
const START = '2024-03-04 00:00:00';
const END = '2024-03-04 23:59:59';
const STEPS = ['view', 'add', 'buy'] as const;

type Step = (typeof STEPS)[number];
const JOURNEYS: Record<string, [Step, string][]> = {
  u1: [
    ['view', 'X'],
    ['add', 'X'],
    ['buy', 'X'],
  ],
  u2: [
    ['view', 'X'],
    ['add', 'Y'],
    ['buy', 'Y'],
  ],
  u3: [
    ['view', 'X'],
    ['view', 'Y'],
    ['add', 'Y'],
    ['buy', 'X'],
  ],
  u4: [
    ['view', 'X'],
    ['add', 'X'],
  ],
  u5: [['view', 'X']],
};

function buildEvents() {
  return Object.entries(JOURNEYS).flatMap(([user, journey]) =>
    journey.map(([step, sku], index) =>
      buildEvent(
        new Date(),
        PROJECT_ID,
        crypto.randomUUID(),
        step,
        `profile-${user}`,
        `session-${user}`,
        0,
        0,
        {
          created_at: `2024-03-04 10:0${index}:00`,
          properties: { sku },
        }
      )
    )
  );
}

function reportInput(
  steps: readonly Step[],
  holdProperties: string[] | undefined,
  breakdowns: IReportInput['breakdowns'] = []
) {
  return {
    projectId: PROJECT_ID,
    startDate: START,
    endDate: END,
    timezone: 'UTC',
    series: steps.map((name, index) => ({
      id: String(index + 1),
      type: 'event' as const,
      name,
      displayName: name,
      segment: 'user' as const,
      filters: [],
    })),
    breakdowns,
    chartType: 'funnel' as const,
    interval: 'day' as const,
    range: 'custom' as const,
    previous: false,
    metric: 'sum' as const,
    options: {
      type: 'funnel' as const,
      funnelWindow: 24,
      funnelGroup: 'session_id',
      holdProperties,
    },
  };
}

async function stepCounts(
  holdProperties: string[] | undefined,
  breakdowns: IReportInput['breakdowns'] = []
) {
  const result = await getFunnel(
    deps,
    reportInput(STEPS, holdProperties, breakdowns)
  );
  return Object.fromEntries(
    result.map((serie) => [
      serie.breakdowns.join('|') || 'all',
      serie.steps.map((step) => step.count),
    ])
  );
}

async function conversionTotals(holdProperties: string[] | undefined) {
  const series = await getConversion(
    deps,
    reportInput(['view', 'buy'], holdProperties)
  );
  const data = series.flatMap((serie) => serie.data);
  return {
    total: data.reduce((sum, point) => sum + point.total, 0),
    conversions: data.reduce((sum, point) => sum + point.conversions, 0),
  };
}

let deps: ServiceDeps;

async function withClient(
  run: (client: ReturnType<typeof createClient>) => Promise<unknown>
) {
  const client = createClient({ url: TEST_CLICKHOUSE_URL });
  try {
    await run(client);
  } finally {
    await client.close();
  }
}

describe('funnel and conversion holding a property constant', () => {
  beforeAll(async () => {
    // The file may be the first to touch ClickHouse in its shard.
    await bootstrapTestDatabases();
    deps = await testServiceDeps();
    await withClient(async (client) => {
      await client.command({
        query: `DELETE FROM events WHERE project_id = '${PROJECT_ID}'`,
      });
      await client.insert({
        table: 'events',
        values: buildEvents(),
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
  });

  it('chains any values without a hold', async () => {
    expect(await stepCounts(undefined)).toEqual({ all: [5, 4, 3] });
  });

  it('only chains steps that share the held value, counting each user once', async () => {
    expect(await stepCounts(['properties.sku'])).toEqual({ all: [5, 3, 1] });
  });

  it('ignores holds on fields that are not event-level', async () => {
    expect(await stepCounts(['profile.email', 'nope'])).toEqual({
      all: [5, 4, 3],
    });
  });

  it('reads a breakdown from the held value that got furthest', async () => {
    expect(
      await stepCounts(['properties.sku'], [{ name: 'properties.sku' }])
    ).toEqual({ X: [4, 2, 1], Y: [1, 1, 0] });
  });

  it('lists the same users as the chart', async () => {
    const ids = await getFunnelProfileIds(deps, {
      projectId: PROJECT_ID,
      startDate: START,
      endDate: END,
      timezone: 'UTC',
      series: reportInput(STEPS, undefined).series,
      funnelWindow: 24,
      funnelGroup: 'session_id',
      holdProperties: ['properties.sku'],
      targetLevel: 2,
      showDropoffs: false,
      breakdownValues: [],
      limit: 100,
    });
    expect(ids.sort()).toEqual(['profile-u1', 'profile-u3', 'profile-u4']);
  });

  it('converts only on a matching value and keeps the total distinct', async () => {
    expect(await conversionTotals(undefined)).toEqual({
      total: 5,
      conversions: 3,
    });
    expect(await conversionTotals(['properties.sku'])).toEqual({
      total: 5,
      conversions: 2,
    });
  });
});
