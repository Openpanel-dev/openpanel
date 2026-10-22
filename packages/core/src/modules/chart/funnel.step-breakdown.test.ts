import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createClient } from '@openpanel/db/src/clickhouse/client';
import { bootstrapTestDatabases } from '../../../../../test/bootstrap-databases';
import { TEST_CLICKHOUSE_URL } from '../../../../../test/databases';
import { buildEvent } from '../../../../../test/fixtures';
import { testServiceDeps } from '../../../test/service-deps';
import type { ServiceDeps } from '../../services';
import type { IReportInput } from '../report/report.constants';
import { getFunnel, getFunnelProfileIds } from './funnel.service';

/**
 * Funnel landing → signup → purchase; only `signup` carries `variant`, and
 * variant A signups carry `duration` 30.
 *
 *   user  events, in order
 *   u1    landing, signup A, purchase
 *   u2    landing, signup A, purchase
 *   u3    landing, signup B
 *   u4    landing, signup B, purchase
 *   u5    landing
 *   u6    signup A                              (never enters the funnel)
 *   u7    signup B, landing, signup A, purchase (in sequence the signup is A)
 */
const PROJECT_ID = 'test-funnel-step-breakdown';
const START = '2024-03-04 00:00:00';
const END = '2024-03-04 23:59:59';

type Step = 'landing' | 'signup' | 'purchase';
type JourneyEvent = Step | [Step, string];
const JOURNEYS: Record<string, JourneyEvent[]> = {
  u1: ['landing', ['signup', 'A'], 'purchase'],
  u2: ['landing', ['signup', 'A'], 'purchase'],
  u3: ['landing', ['signup', 'B']],
  u4: ['landing', ['signup', 'B'], 'purchase'],
  u5: ['landing'],
  u6: [['signup', 'A']],
  u7: [['signup', 'B'], 'landing', ['signup', 'A'], 'purchase'],
};

function buildEvents() {
  return Object.entries(JOURNEYS).flatMap(([user, journey]) =>
    journey.map((journeyEvent, index) => {
      const [step, variant] =
        typeof journeyEvent === 'string' ? [journeyEvent] : journeyEvent;
      return buildEvent(
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
          properties: variant ? { variant } : {},
          duration: variant === 'A' ? 30 : 0,
        }
      );
    })
  );
}

function funnelInput(
  breakdowns: IReportInput['breakdowns']
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
    breakdowns,
    chartType: 'funnel',
    interval: 'day',
    range: 'custom',
    previous: false,
    metric: 'sum',
    options: { type: 'funnel', funnelWindow: 24, funnelGroup: 'session_id' },
  };
}

async function stepCountsBySegment(breakdowns: IReportInput['breakdowns']) {
  const result = await getFunnel(deps, funnelInput(breakdowns));
  return Object.fromEntries(
    result.map((serie) => [
      serie.breakdowns.join('|'),
      serie.steps.map((step) => step.count),
    ])
  );
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

describe('funnel breakdown by a property of one step', () => {
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

  it('attributes to the first step by default', async () => {
    expect(await stepCountsBySegment([{ name: 'properties.variant' }])).toEqual(
      { 'Not set': [6, 5, 4] }
    );
  });

  it('segments every step by the chosen step, read from the event in the sequence, with a bucket for who never reached it', async () => {
    expect(
      await stepCountsBySegment([{ name: 'properties.variant', step: 2 }])
    ).toEqual({
      A: [3, 3, 3],
      B: [2, 2, 1],
      'Did not reach step 2': [1, 0, 0],
    });
  });

  it('segments by a numeric column of the chosen step', async () => {
    expect(await stepCountsBySegment([{ name: 'duration', step: 2 }])).toEqual({
      '30': [3, 3, 3],
      '0': [2, 2, 1],
      'Did not reach step 2': [1, 0, 0],
    });
  });

  it('lists the users of a step bucket', async () => {
    const profilesAt = (breakdownValue: string, targetLevel: number) =>
      getFunnelProfileIds(deps, {
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        timezone: 'UTC',
        series: funnelInput([]).series,
        breakdowns: [{ name: 'properties.variant', step: 2 }],
        breakdownValues: [breakdownValue],
        targetLevel,
        showDropoffs: false,
        limit: 10,
      }).then((ids) => ids.sort());

    expect(await profilesAt('Did not reach step 2', 1)).toEqual(['profile-u5']);
    expect(await profilesAt('B', 3)).toEqual(['profile-u4']);
  });
});
