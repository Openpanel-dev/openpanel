// realtime.service.ts's db/ch/redis access is lazy (`await import(...)`
// inside each function — see the file's header), which is exactly what makes
// `mock.module` work here with no import-time side effects to race: every
// mock below is registered before the subject's first call, not before its
// (side-effect-free) import.
//
// Scope: the "/live websocket glue" (new logic this wave adds) plus one
// representative ClickHouse query (`getRealtimeActiveSessions`) proving the
// lazy-load + filter/limit wiring. The other five queries are a verbatim
// port of packages/trpc/src/routers/realtime.ts's SQL — mechanical, not new
// behaviour — and are exercised end-to-end by realtime.rpc.test.ts's
// unauthenticated-boundary tests plus this repo's local ClickHouse run (see
// the task summary for the executed query + row count).

import { afterAll, beforeAll, beforeEach, expect, mock, test } from 'bun:test';

const activeVisitorCountByProject = new Map<string, number>();
const eventBuffer = {
  getActiveVisitorCount: mock(
    async (projectId: string) => activeVisitorCountByProject.get(projectId) ?? 0
  ),
};
// Spread the real module — `event.service.ts` (reached via
// `getRealtimeActiveSessions`'s `transformEvent` load) imports `botBuffer`
// alongside `eventBuffer` from this same specifier; a partial factory here
// would break that unrelated import, same hazard as the clickhouse/client
// mock below. Snapshotted into a plain object BEFORE mocking: the live
// import binding would reflect the mock too once `mock.module` below swaps
// the specifier, making a same-binding "restore" a no-op.
const actualBuffers = await import('@openpanel/db/src/buffers');
const realBuffers = { ...actualBuffers };
mock.module('@openpanel/db/src/buffers', () => ({
  ...realBuffers,
  eventBuffer,
}));

afterAll(() => {
  mock.module('@openpanel/db/src/buffers', () => realBuffers);
});

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
// realtime.service.ts's `loadRedis` header for why this file exists at all).
const actualRedis = await import('@openpanel/redis');
const realRedis = { ...actualRedis };
mock.module('@openpanel/redis', () => ({
  ...realRedis,
  subscribeToPublishedEvent,
}));

afterAll(() => {
  mock.module('@openpanel/redis', () => realRedis);
});

const chQuery = mock(async (_query: string) => [] as unknown[]);
const actualClickhouseClient = await import(
  '@openpanel/db/src/clickhouse/client'
);
const realClickhouseClient = { ...actualClickhouseClient };
mock.module('@openpanel/db/src/clickhouse/client', () => ({
  ...realClickhouseClient,
  chQuery,
}));

afterAll(() => {
  mock.module(
    '@openpanel/db/src/clickhouse/client',
    () => realClickhouseClient
  );
});

let subject: typeof import('./realtime.service');

beforeAll(async () => {
  subject = await import('./realtime.service');
});

beforeEach(() => {
  activeVisitorCountByProject.clear();
  subscribeToPublishedEvent.mockClear();
  chQuery.mockClear();
  unsubscribeCalls = 0;
});

test('getActiveVisitorCount reads through the event buffer, keyed by project', async () => {
  activeVisitorCountByProject.set('proj_1', 7);

  await expect(subject.getActiveVisitorCount('proj_1')).resolves.toBe(7);
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

test('subscribeToOrganizationSubscriptionUpdates subscribes on organization:subscription_updated, unfiltered', async () => {
  const onUpdate = mock((_message: unknown) => undefined);
  await subject.subscribeToOrganizationSubscriptionUpdates(onUpdate);

  const [channel, type, callback] = subscribeToPublishedEvent.mock.calls[0]!;
  expect(channel).toBe('organization');
  expect(type).toBe('subscription_updated');

  (callback as (event: unknown) => void)({ organizationId: 'org_1' });
  expect(onUpdate).toHaveBeenCalledWith({ organizationId: 'org_1' });
});

test('getRealtimeActiveSessions scopes the query to the project and the 30-minute window', async () => {
  chQuery.mockImplementationOnce(async () => [
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
  ]);

  const result = await subject.getRealtimeActiveSessions('proj_1');

  expect(chQuery).toHaveBeenCalledTimes(1);
  const [query] = chQuery.mock.calls[0]!;
  expect(query).toContain("project_id = 'proj_1'");
  expect(query).toContain('created_at >=');
  expect(query).toContain('LIMIT 50');
  expect(result).toHaveLength(1);
  expect(result[0]?.sessionId).toBe('sess_1');
});
