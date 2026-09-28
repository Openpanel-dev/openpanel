// Realtime.service.ts takes `ServiceDeps` now, so the event buffer and the
// ClickHouse client are HANDED IN (`deps.buffers.event`, `deps.ch`) rather than
// mocked onto a module specifier.
//
// The subject and the real-module snapshot are STATIC imports.
// `@openpanel/redis` is a static import in the subject too (the R6 fix removed
// the `loadRedis` lazy hop) — Bun's `mock.module` still applies because it
// swaps an already-loaded module's exports in place, so a consumer that
// imported before the mock call still sees it — measured on Bun 1.4.0, and the
// subscribe assertions go red if it ever stops. That leaves this module with no
// deferred loads at all (docs/TECH_DEBT.md's no-lazy-loaders ruling).
//
// Every assertion below is the one it was before the deps switch: the same
// project scoping, the same 30-minute window, the same filter/limit wiring, the
// same subscribe/unsubscribe behaviour.
//
// Scope: the "/live websocket glue" (new logic this wave adds) plus one
// representative ClickHouse query (`getRealtimeActiveSessions`) proving the
// deps + filter/limit wiring. The other five queries are a verbatim port of
// packages/trpc/src/routers/realtime.ts's SQL — mechanical, not new behaviour —
// and are exercised end-to-end by realtime.rpc.test.ts's
// unauthenticated-boundary tests plus this repo's local ClickHouse run (see the
// task summary for the executed query + row count).

import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import * as actualRedis from '@openpanel/redis';
import * as subject from './realtime.service';

const activeVisitorCountByProject = new Map<string, number>();
const eventBuffer = {
  getActiveVisitorCount: mock(
    async (projectId: string) => activeVisitorCountByProject.get(projectId) ?? 0
  ),
};

const subscribeToPublishedEvent = mock(
  (_channel: string, _type: string, _cb: (event: unknown) => void) => {
    return () => {
      unsubscribeCalls++;
    };
  }
);
let unsubscribeCalls = 0;

// Spread the real module — a partial factory here would be a process-wide
// hazard for every other test file mocking `@openpanel/redis` narrowly (see
// `@openpanel/redis`'s import at the top of realtime.service.ts).
const realRedis = { ...actualRedis };
mock.module('@openpanel/redis', () => ({
  ...realRedis,
  subscribeToPublishedEvent,
}));

afterAll(() => {
  mock.module('@openpanel/redis', () => realRedis);
});

// `deps.ch.query` is what ch-query.ts calls; it returns the raw
// ClickHouse response envelope, so the stub speaks that shape.
let nextRows: unknown[] = [];
const chQuery = mock(
  async (_args: {
    query: string;
    query_params: Record<string, string | number>;
  }) => ({
    json: async () => ({ data: nextRows, meta: [], rows: nextRows.length }),
  })
);

const MINUTES_PER_REALTIME_WINDOW = 30;
const MS_PER_MINUTE = 60_000;
const REALTIME_WINDOW_MS = MINUTES_PER_REALTIME_WINDOW * MS_PER_MINUTE;
const CLOCK_TOLERANCE_MS = 5000;
const ACTIVE_SESSIONS_LIMIT = 50;

const noop = () => undefined;
const deps = {
  ch: { query: chQuery },
  buffers: { event: eventBuffer },
  logger: {
    fatal: noop,
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    trace: noop,
    child: () => deps.logger,
  },
} as unknown as import('../../services').ServiceDeps;

beforeEach(() => {
  activeVisitorCountByProject.clear();
  subscribeToPublishedEvent.mockClear();
  chQuery.mockClear();
  nextRows = [];
  unsubscribeCalls = 0;
});

test('getActiveVisitorCount reads through the event buffer, keyed by project', async () => {
  activeVisitorCountByProject.set('proj_1', 7);

  await expect(subject.getActiveVisitorCount(deps, 'proj_1')).resolves.toBe(7);
  expect(eventBuffer.getActiveVisitorCount).toHaveBeenCalledWith('proj_1');
});

test('subscribeToVisitorActivity subscribes on events:batch and filters by projectId', async () => {
  const onActivity = mock(() => undefined);
  const unsubscribe = await subject.subscribeToVisitorActivity(
    'proj_1',
    onActivity
  );

  expect(subscribeToPublishedEvent).toHaveBeenCalledTimes(1);
  const [channel, type, callback] = subscribeToPublishedEvent.mock.calls[0]!;
  expect(channel).toBe('events');
  expect(type).toBe('batch');

  (callback as (event: unknown) => void)({ projectId: 'proj_other', count: 1 });
  expect(onActivity).not.toHaveBeenCalled();

  (callback as (event: unknown) => void)({ projectId: 'proj_1', count: 1 });
  expect(onActivity).toHaveBeenCalledTimes(1);

  unsubscribe();
  expect(unsubscribeCalls).toBe(1);
});

test('subscribeToProjectEventBatches hands the whole batch through, filtered by projectId', async () => {
  const onBatch = mock((_event: unknown) => undefined);
  await subject.subscribeToProjectEventBatches('proj_1', onBatch);

  const callback = subscribeToPublishedEvent.mock.calls[0]![2] as (
    event: unknown
  ) => void;

  callback({ projectId: 'proj_1', count: 3 });
  expect(onBatch).toHaveBeenCalledWith({ projectId: 'proj_1', count: 3 });
});

test('subscribeToProjectNotifications subscribes on notification:created and filters by projectId', async () => {
  const onNotification = mock((_notification: unknown) => undefined);
  await subject.subscribeToProjectNotifications('proj_1', onNotification);

  const [channel, type, callback] = subscribeToPublishedEvent.mock.calls[0]!;
  expect(channel).toBe('notification');
  expect(type).toBe('created');

  (callback as (event: unknown) => void)({
    projectId: 'proj_other',
    title: 't',
  });
  expect(onNotification).not.toHaveBeenCalled();

  (callback as (event: unknown) => void)({ projectId: 'proj_1', title: 't' });
  expect(onNotification).toHaveBeenCalledTimes(1);
});

// / F2: the `organization:subscription_updated` channel is instance-wide.
// Unfiltered, a subscriber saw the `organizationId` of every organization whose
// subscription changed — including ones it is not a member of. This test is red
// without the filter.
test('subscribeToOrganizationSubscriptionUpdates subscribes on organization:subscription_updated and filters by organizationId', async () => {
  const onUpdate = mock((_message: unknown) => undefined);
  await subject.subscribeToOrganizationSubscriptionUpdates('org_1', onUpdate);

  const [channel, type, callback] = subscribeToPublishedEvent.mock.calls[0]!;
  expect(channel).toBe('organization');
  expect(type).toBe('subscription_updated');

  (callback as (event: unknown) => void)({ organizationId: 'org_other' });
  expect(onUpdate).not.toHaveBeenCalled();

  (callback as (event: unknown) => void)({ organizationId: 'org_1' });
  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(onUpdate).toHaveBeenCalledWith({ organizationId: 'org_1' });
});

test('getRealtimeActiveSessions scopes the query to the project and the 30-minute window', async () => {
  nextRows = [
    {
      name: 'screen_view',
      session_id: 'sess_1',
      created_at: '2026-09-04 00:00:00',
      path: '/',
      origin: 'https://example.com',
      referrer: '',
      referrer_name: '',
      country: 'SE',
      city: 'Stockholm',
      region: '',
      os: 'macOS',
      os_version: '',
      browser: 'Chrome',
      browser_version: '',
      device: 'desktop',
    },
  ];

  const result = await subject.getRealtimeActiveSessions(deps, 'proj_1');

  expect(chQuery).toHaveBeenCalledTimes(1);
  // The statement binds its values, so the project scoping and the window live
  // in `query_params` — the assertion follows them there.
  const { query, query_params } = chQuery.mock.calls[0]![0];
  expect(query).toContain('project_id = {p1:String}');
  expect(query).toContain('created_at >= {p2:String}');
  expect(query).toContain('LIMIT {p3:UInt64}');
  expect(query_params.p1).toBe('proj_1');
  const windowStart = String(query_params.p2).replace(' ', 'T');
  const windowAgeMs = Date.now() - Date.parse(`${windowStart}Z`);
  expect(windowAgeMs).toBeGreaterThanOrEqual(REALTIME_WINDOW_MS);
  expect(windowAgeMs).toBeLessThan(REALTIME_WINDOW_MS + CLOCK_TOLERANCE_MS);
  expect(query_params.p3).toBe(ACTIVE_SESSIONS_LIMIT);
  expect(result).toHaveLength(1);
  expect(result[0]?.sessionId).toBe('sess_1');
});
