import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createClient } from '@openpanel/db/src/clickhouse/client';
import { bootstrapTestDatabases } from '../../../../../test/bootstrap-databases';
import { TEST_CLICKHOUSE_URL } from '../../../../../test/databases';
import { buildEvent } from '../../../../../test/fixtures';
import { testServiceDeps } from '../../../test/service-deps';
import type { ServiceDeps } from '../../services';
import type { ITimeToConvertAggregation } from '../report/report.constants';
import { getFunnel } from './funnel.service';

/**
 * Funnel landing → signup → purchase with a one hour window.
 *
 *   user  events (minutes past 10:00)                  chain windowFunnel holds
 *   u1    landing 0, signup 1, purchase 3              0, 1, 3
 *   u2    landing 0, signup 5                          0, 5
 *   u3    landing 0, landing 10, signup 12, purchase 20 10, 12, 20   (restarts at the later landing)
 *   u4    landing 0, signup 120                        0              (signup is outside the window)
 *   u5    landing 0, signup 2, landing 30, signup 31, purchase 40
 *                                                      30, 31, 40
 */
const PROJECT_ID = 'test-funnel-time-to-convert';
const START = '2024-03-04 00:00:00';
const END = '2024-03-04 23:59:59';
const FUNNEL_WINDOW_HOURS = 1;

type Step = 'landing' | 'signup' | 'purchase';
const JOURNEYS: Record<string, [Step, number][]> = {
  u1: [
    ['landing', 0],
    ['signup', 1],
    ['purchase', 3],
  ],
  u2: [
    ['landing', 0],
    ['signup', 5],
  ],
  u3: [
    ['landing', 0],
    ['landing', 10],
    ['signup', 12],
    ['purchase', 20],
  ],
  u4: [
    ['landing', 0],
    ['signup', 120],
  ],
  u5: [
    ['landing', 0],
    ['signup', 2],
    ['landing', 30],
    ['signup', 31],
    ['purchase', 40],
  ],
};

const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_MINUTE = 60_000;
const JOURNEY_START = Date.UTC(2024, 2, 4, 10);

function buildEvents() {
  return Object.entries(JOURNEYS).flatMap(([user, journey]) =>
    journey.map(([step, minute]) =>
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
          created_at: new Date(JOURNEY_START + minute * MILLISECONDS_PER_MINUTE)
            .toISOString()
            .replace('T', ' ')
            .replace('Z', ''),
        }
      )
    )
  );
}

function funnelInput(
  timeToConvert: ITimeToConvertAggregation | undefined
): Parameters<typeof getFunnel>[1] {
  return {
    projectId: PROJECT_ID,
    startDate: START,
    endDate: END,
    timezone: 'UTC',
    series: (['landing', 'signup', 'purchase'] as const).map((name, index) => ({
      id: String(index + 1),
      type: 'event' as const,
      name,
      displayName: name,
      segment: 'user' as const,
      filters: [],
    })),
    breakdowns: [],
    chartType: 'funnel',
    interval: 'day',
    range: 'custom',
    previous: false,
    metric: 'sum',
    options: {
      type: 'funnel',
      funnelWindow: FUNNEL_WINDOW_HOURS,
      funnelGroup: 'session_id',
      timeToConvert,
    },
  };
}

/** Per step: [count, minutes from the previous step]; plus first → last in minutes. */
async function timesToConvert(aggregation?: ITimeToConvertAggregation) {
  const [funnel] = await getFunnel(deps, funnelInput(aggregation));
  const toMinutes = (seconds: number | null | undefined) =>
    seconds == null ? null : seconds / SECONDS_PER_MINUTE;
  return {
    steps: funnel?.steps.map((step) => [
      step.count,
      toMinutes(step.timeToConvert),
    ]),
    total: toMinutes(funnel?.timeToConvert),
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

describe('funnel time to convert', () => {
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

  it('is not computed unless the report asks for it', async () => {
    expect(await timesToConvert()).toEqual({
      steps: [
        [5, null],
        [4, null],
        [3, null],
      ],
      total: null,
    });
  });

  it('averages each step over the groups that reached it, timed on the chain windowFunnel holds', async () => {
    // Step 2: u1 1, u2 5, u3 2, u5 1. Step 3: u1 2, u3 8, u5 9. First → last: u1 3, u3 10, u5 10.
    expect(await timesToConvert('avg')).toEqual({
      steps: [
        [5, null],
        [4, 9 / 4],
        [3, 19 / 3],
      ],
      total: 23 / 3,
    });
  });

  it('reads min, max and median from the same times', async () => {
    expect(await timesToConvert('min')).toEqual({
      steps: [
        [5, null],
        [4, 1],
        [3, 2],
      ],
      total: 3,
    });
    expect(await timesToConvert('max')).toEqual({
      steps: [
        [5, null],
        [4, 5],
        [3, 9],
      ],
      total: 10,
    });
    expect((await timesToConvert('median')).steps?.[2]).toEqual([3, 8]);
  });
});
