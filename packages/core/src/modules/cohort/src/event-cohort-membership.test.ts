// Integration test for event cohorts with filters against the isolated
// `openpanel_test` ClickHouse (pinned by test/preload.ts).
//
// Fixture (test/fixtures.ts): Alice — page_view /home 2 days ago (Chrome);
// Charlie — screen_view + page_view /shop 5 days ago (Firefox), purchase;
// Bob — no events. This suite adds one page_view for Alice carrying
// `properties.plan = pro`.

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  pinFixtureClock,
  releaseFixtureClock,
} from '../../../../test/fixture-clock';
import type { EventCriteria } from '../cohort.constants';

const TEST_PROJECT_ID = 'cohort-event-filters-test';
const LAST_30_DAYS = { type: 'relative', value: '30d' } as const;
const ALICE_PRO_EVENT_ID = '00000000-0000-0000-0000-00000000c0f1';

let FIXTURE: typeof import('../../../../../../test/fixtures').FIXTURE;
let subject: typeof import('../cohort.service');
let deps: import('../../../services').ServiceDeps;

beforeAll(async () => {
  const fixtures = await import('../../../../../../test/fixtures');
  FIXTURE = fixtures.FIXTURE;
  const { bootstrapTestDatabases } = await import(
    '../../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();
  const { testServiceDeps } = await import('../../../../test/service-deps');
  deps = await testServiceDeps();
  subject = await import('../cohort.service');

  const now = pinFixtureClock();
  await fixtures.setupFixtures(TEST_PROJECT_ID);
  await deps.ch.insert({
    table: 'events',
    values: [
      fixtures.buildEvent(
        now,
        TEST_PROJECT_ID,
        ALICE_PRO_EVENT_ID,
        'page_view',
        FIXTURE.profiles.alice,
        FIXTURE.sessions.alice1,
        2,
        1,
        { path: '/pricing', properties: { plan: 'pro' } }
      ),
    ],
    format: 'JSONEachRow',
  });
});

afterAll(async () => {
  const fixtures = await import('../../../../../../test/fixtures');
  await fixtures.teardownFixtures(TEST_PROJECT_ID);
  releaseFixtureClock();
});

function members(criteria: EventCriteria): Promise<string[]> {
  return subject
    .computeEventBasedCohort(deps, TEST_PROJECT_ID, {
      type: 'event',
      criteria: { operator: 'and', events: [criteria] },
    })
    .then((ids) => ids.sort());
}

describe('event cohort membership with filters', () => {
  it('matches everyone who did the event when there is no filter', async () => {
    expect(
      await members({ name: 'page_view', filters: [], timeframe: LAST_30_DAYS })
    ).toEqual([FIXTURE.profiles.alice, FIXTURE.profiles.charlie]);
  });

  it('narrows by a path prefix', async () => {
    expect(
      await members({
        name: 'page_view',
        filters: [
          { id: 'f', name: 'path', operator: 'startsWith', value: ['/sh'] },
        ],
        timeframe: LAST_30_DAYS,
        frequency: { operator: 'gte', count: 1 },
      })
    ).toEqual([FIXTURE.profiles.charlie]);
  });

  it('narrows by a bare column alongside has_profile', async () => {
    expect(
      await members({
        name: 'page_view',
        filters: [
          { id: 'b', name: 'browser', operator: 'is', value: ['Chrome'] },
          { id: 'p', name: 'has_profile', operator: 'is', value: ['true'] },
        ],
        timeframe: LAST_30_DAYS,
      })
    ).toEqual([FIXTURE.profiles.alice]);
  });

  it('narrows by an event property with a non-equality operator', async () => {
    expect(
      await members({
        name: 'page_view',
        filters: [
          {
            id: 'f',
            name: 'properties.plan',
            operator: 'startsWith',
            value: ['pr'],
          },
        ],
        timeframe: LAST_30_DAYS,
      })
    ).toEqual([FIXTURE.profiles.alice]);
  });

  it('ANDs two filters on the same event', async () => {
    expect(
      await members({
        name: 'page_view',
        filters: [
          { id: 'f', name: 'properties.plan', operator: 'is', value: ['pro'] },
          { id: 'g', name: 'path', operator: 'is', value: ['/home'] },
        ],
        timeframe: LAST_30_DAYS,
      })
    ).toEqual([]);
  });

  it('counts events, not property rows, for the frequency', async () => {
    expect(
      await members({
        name: 'page_view',
        filters: [
          { id: 'f', name: 'browser', operator: 'is', value: ['Chrome'] },
        ],
        timeframe: LAST_30_DAYS,
        frequency: { operator: 'eq', count: 2 },
      })
    ).toEqual([FIXTURE.profiles.alice]);
  });

  it('inverts a never-did criterion around the filtered events', async () => {
    expect(
      await members({
        name: 'page_view',
        filters: [
          { id: 'f', name: 'path', operator: 'startsWith', value: ['/sh'] },
        ],
        timeframe: LAST_30_DAYS,
        frequency: { operator: 'eq', count: 0 },
      })
    ).toEqual([FIXTURE.profiles.alice, FIXTURE.profiles.bob]);
  });
});
