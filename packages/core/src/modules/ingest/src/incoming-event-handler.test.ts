// Ported from apps/worker/src/jobs/events.incoming-events.test.ts (M8-003)
// with every assertion unchanged. What changed is the seam: V1 reached the
// session buffer, `createEvent` and the sessions queue through
// `vi.mock('@openpanel/db')` / `vi.mock('@openpanel/queue')`; here they are
// recording doubles handed in as `IncomingEventDeps`, so the assertions are
// on calls the code under test actually made and no `mock.module` is needed.
//
// The session_end enqueue is asserted through the real `sessionEndJobPayload`
// / `sessionEndEnqueueOptions` — the same functions V1's producer
// (`enqueueSessionEndV2`) calls — so the jobId and the `{payload, snapshot}`
// mapping are still pinned here, not re-implemented by the test.

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createDuplicateEventMarker } from '@openpanel/redis';
import { formatClickhouseDate } from '../../event/src/dates';
import type { IClickhouseSession } from '../../session/session.service';
import {
  sessionEndEnqueueOptions,
  sessionEndJobPayload,
} from '../../session/src/session-end';
import type { IncomingEventPayload } from './incoming-event';
import {
  type IncomingEventDeps,
  incomingEvent,
} from './incoming-event-handler';

const projectId = 'test-project';
const deviceId = 'device-123';
const newSessionId = 'a1b2c3d4-e5f6-4789-a012-345678901234';
// What the producer (/track) would have minted for one request.
const producedEventId = '11111111-2222-4333-8444-555555555555';
const geo = {
  country: 'US',
  city: 'New York',
  region: 'NY',
  longitude: 0,
  latitude: 0,
};

const uaInfo: IncomingEventPayload['uaInfo'] = {
  isServer: false,
  device: 'desktop',
  os: 'Windows',
  osVersion: '10',
  browser: 'Chrome',
  browserVersion: '91.0.4472.124',
  brand: '',
  model: '',
};

const uaInfoServer: IncomingEventPayload['uaInfo'] = {
  isServer: true,
  device: 'server',
  os: '',
  osVersion: '',
  browser: '',
  browserVersion: '',
  brand: '',
  model: '',
};

function makeSession(
  overrides: Partial<IClickhouseSession> = {}
): IClickhouseSession {
  const now = new Date();
  return {
    id: 'session-existing',
    project_id: projectId,
    device_id: deviceId,
    profile_id: '',
    event_count: 1,
    screen_view_count: 0,
    entry_path: '/',
    entry_origin: 'https://example.com',
    exit_path: '/',
    exit_origin: 'https://example.com',
    created_at: formatClickhouseDate(now),
    ended_at: formatClickhouseDate(now),
    os: 'Windows',
    os_version: '10',
    browser: 'Chrome',
    browser_version: '91.0.4472.124',
    device: 'desktop',
    brand: '',
    model: '',
    country: 'US',
    region: 'NY',
    city: 'New York',
    longitude: 0,
    latitude: 0,
    duration: 0,
    referrer: '',
    referrer_name: '',
    referrer_type: '',
    is_bounce: true,
    utm_term: '',
    utm_source: '',
    utm_campaign: '',
    utm_content: '',
    utm_medium: '',
    revenue: 0,
    sign: 1,
    version: 1,
    groups: [],
    ...overrides,
  } satisfies IClickhouseSession;
}

function buildJobData(
  overrides: Partial<IncomingEventPayload> = {}
): IncomingEventPayload {
  return {
    geo,
    event: {
      name: 'test_event',
      timestamp: new Date().toISOString(),
      isTimestampFromThePast: false,
      properties: { __path: 'https://example.com/test' },
    },
    uaInfo,
    headers: {
      'request-id': '123',
      'user-agent': 'Mozilla/5.0',
      'openpanel-sdk-name': 'web',
      'openpanel-sdk-version': '1.0.0',
    },
    projectId,
    deviceId,
    sessionId: newSessionId,
    ...overrides,
  };
}

const noopLogger = (() => {
  const noop = () => undefined;
  const logger = {
    fatal: noop,
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    trace: noop,
    child: () => logger,
  };
  return logger;
})();

function makeDeps() {
  const createEvent = mock<IncomingEventDeps['createEvent']>(
    async (event) => event
  );
  const getExistingSession = mock<
    IncomingEventDeps['sessions']['getExistingSession']
  >(async () => null);
  const ingest = mock<IncomingEventDeps['sessions']['ingest']>(
    async () => null
  );
  const enqueueSessionEnd = mock<IncomingEventDeps['enqueueSessionEnd']>(
    async () => undefined
  );
  const markDuplicate = mock<IncomingEventDeps['markDuplicate']>(
    async () => false
  );
  const duplicateMarked = mock(() => undefined);
  const deps: IncomingEventDeps = {
    logger: noopLogger,
    sessions: { getExistingSession, ingest },
    createEvent,
    checkNotificationRulesForEvent: mock(async () => true),
    projects: {
      getCached: mock(async () => ({ firstEventAt: new Date(), filters: [] })),
      markFirstEvent: mock(async () => undefined),
    },
    enqueueSessionEnd,
    markDuplicate,
    metrics: {
      sessionStarted: mock(() => undefined),
      sessionEndEnqueued: mock(() => undefined),
      duplicateMarked,
    },
  };
  return {
    deps,
    createEvent,
    getExistingSession,
    ingest,
    enqueueSessionEnd,
    markDuplicate,
    duplicateMarked,
  };
}

/** Every `createEvent` call's first argument, in order. */
const createdEvents = (createEvent: {
  mock: { calls: unknown[][] };
}): Record<string, unknown>[] =>
  createEvent.mock.calls.map(([arg]) => arg as Record<string, unknown>);

let ctx: ReturnType<typeof makeDeps>;

beforeEach(() => {
  ctx = makeDeps();
});

describe('incomingEvent', () => {
  test('emits session_start when ingest returns kind="new"', async () => {
    const { deps, createEvent, ingest, enqueueSessionEnd } = ctx;
    ingest.mockResolvedValueOnce({
      kind: 'new',
      current: makeSession({ id: newSessionId }),
    });

    await incomingEvent(buildJobData(), deps);

    expect(enqueueSessionEnd).not.toHaveBeenCalled();
    const calls = createdEvents(createEvent);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.name).toBe('session_start');
    expect(calls[1]!.name).toBe('test_event');
  });

  test('skips session_start when ingest returns kind="extend"', async () => {
    const { deps, createEvent, ingest, enqueueSessionEnd } = ctx;
    ingest.mockResolvedValueOnce({ kind: 'extend', current: makeSession() });

    await incomingEvent(buildJobData(), deps);

    expect(enqueueSessionEnd).not.toHaveBeenCalled();
    const sessionStartCalls = createdEvents(createEvent).filter(
      (arg) => arg.name === 'session_start'
    );
    expect(sessionStartCalls).toHaveLength(0);
  });

  test('closes old session and emits session_start when ingest returns kind="boundary"', async () => {
    const { deps, createEvent, ingest, enqueueSessionEnd } = ctx;
    const closed = makeSession({ id: 'old-session-id' });
    const current = makeSession({ id: newSessionId });
    ingest.mockResolvedValueOnce({ kind: 'boundary', current, closed });

    await incomingEvent(buildJobData(), deps);

    expect(enqueueSessionEnd).toHaveBeenCalledTimes(1);
    const input = enqueueSessionEnd.mock.calls[0]![0];
    // The wire payload V1's producer builds from this input, through the same
    // core functions it calls.
    const { event, snapshot } = sessionEndJobPayload(input);
    expect(event.sessionId).toBe('old-session-id');
    expect(snapshot.id).toBe('old-session-id');
    expect(sessionEndEnqueueOptions(input.closedSession.id).jobId).toBe(
      'sessionEnd:v2:old-session-id'
    );

    const calls = createdEvents(createEvent);
    expect(calls.filter((a) => a.name === 'session_start')).toHaveLength(1);
    expect(calls.filter((a) => a.name === 'test_event')).toHaveLength(1);
  });

  test('inherits referrer from current session on the actual event', async () => {
    const { deps, createEvent, ingest } = ctx;
    ingest.mockResolvedValueOnce({
      kind: 'extend',
      current: makeSession({
        referrer: 'https://google.com',
        referrer_name: 'Google',
        referrer_type: 'search',
      }),
    });

    await incomingEvent(buildJobData(), deps);

    const testEventCall = createdEvents(createEvent).find(
      (a) => a.name === 'test_event'
    );
    expect(testEventCall!.referrer).toBe('https://google.com');
    expect(testEventCall!.referrerName).toBe('Google');
    expect(testEventCall!.referrerType).toBe('search');
  });

  test('handles server events with existing profile session', async () => {
    const { deps, createEvent, ingest, getExistingSession, enqueueSessionEnd } =
      ctx;
    const timestamp = new Date();
    const jobData = buildJobData({
      event: {
        name: 'server_event',
        timestamp: timestamp.toISOString(),
        properties: { custom_property: 'test_value' },
        profileId: 'profile-123',
        isTimestampFromThePast: false,
      },
      uaInfo: uaInfoServer,
      deviceId: '',
      sessionId: '',
      headers: {
        'user-agent': 'OpenPanel Server/1.0',
        'openpanel-sdk-name': 'server',
        'openpanel-sdk-version': '1.0.0',
        'request-id': '123',
      },
    });

    getExistingSession.mockResolvedValueOnce(
      makeSession({
        id: 'last-session-456',
        device_id: 'last-device-123',
        profile_id: 'profile-123',
        os: 'iOS',
        os_version: '15.0',
        browser: 'Safari',
        browser_version: '15.0',
        device: 'mobile',
        brand: 'Apple',
        model: 'iPhone',
        country: 'CA',
        region: 'ON',
        city: 'Toronto',
        entry_path: '/last-path',
        entry_origin: 'https://example.com',
        exit_path: '/last-path',
        exit_origin: 'https://example.com',
        referrer: 'https://google.com',
        referrer_name: 'Google',
        referrer_type: 'search',
        is_bounce: false,
        event_count: 0,
        screen_view_count: 0,
      })
    );

    await incomingEvent(jobData, deps);

    expect(ingest).not.toHaveBeenCalled();
    expect(enqueueSessionEnd).not.toHaveBeenCalled();
    expect(createdEvents(createEvent)[0]!).toMatchObject({
      name: 'server_event',
      deviceId: 'last-device-123',
      sessionId: 'last-session-456',
      profileId: 'profile-123',
      city: 'Toronto',
      country: 'CA',
      referrer: 'https://google.com',
    });
  });

  test('handles server events without any active session', async () => {
    const { deps, createEvent, ingest, getExistingSession, enqueueSessionEnd } =
      ctx;
    getExistingSession.mockResolvedValueOnce(null);

    await incomingEvent(
      buildJobData({
        event: {
          name: 'server_event',
          timestamp: new Date().toISOString(),
          properties: { custom_property: 'test_value' },
          profileId: 'profile-123',
          isTimestampFromThePast: false,
        },
        uaInfo: uaInfoServer,
        deviceId: '',
        sessionId: '',
        headers: {
          'user-agent': 'OpenPanel Server/1.0',
          'openpanel-sdk-name': 'server',
          'openpanel-sdk-version': '1.0.0',
          'request-id': '123',
        },
      }),
      deps
    );

    expect(ingest).not.toHaveBeenCalled();
    expect(enqueueSessionEnd).not.toHaveBeenCalled();
    expect(createdEvents(createEvent)[0]!).toMatchObject({
      name: 'server_event',
      deviceId: '',
      sessionId: '',
      profileId: 'profile-123',
    });
  });

  test('re-creates the same row id when Kafka redelivers the message', async () => {
    const { deps, createEvent, ingest } = ctx;
    const session = makeSession({ id: newSessionId });
    ingest
      .mockResolvedValueOnce({ kind: 'new', current: session })
      .mockResolvedValueOnce({ kind: 'extend', current: session });

    // Same message, delivered twice: identical payload, identical offset.
    const jobData = buildJobData({ id: producedEventId });
    const delivery = { partition: 3, offset: '42' };
    await incomingEvent(jobData, deps, delivery);
    await incomingEvent(jobData, deps, delivery);

    const eventCalls = createdEvents(createEvent).filter(
      (a) => a.name === 'test_event'
    );
    expect(eventCalls).toHaveLength(2);
    expect(eventCalls[0]!.id).toBe(producedEventId);
    expect(eventCalls[1]!.id).toBe(producedEventId);

    // The derived session_start row must NOT reuse the event's id.
    const sessionStartCalls = createdEvents(createEvent).filter(
      (a) => a.name === 'session_start'
    );
    expect(sessionStartCalls).toHaveLength(1);
    expect(sessionStartCalls[0]!.id).toBeUndefined();
  });

  test('carries the producer-minted id on server-side events', async () => {
    const { deps, createEvent, getExistingSession } = ctx;
    getExistingSession.mockResolvedValueOnce(null);

    await incomingEvent(
      buildJobData({
        id: producedEventId,
        event: {
          name: 'server_event',
          timestamp: new Date().toISOString(),
          isTimestampFromThePast: false,
          profileId: 'profile-123',
        },
        uaInfo: uaInfoServer,
        deviceId: '',
        sessionId: '',
      }),
      deps
    );

    expect(createdEvents(createEvent)[0]!.id).toBe(producedEventId);
  });

  test('leaves the id undefined for a payload produced without one', async () => {
    const { deps, createEvent, ingest } = ctx;
    ingest.mockResolvedValueOnce({ kind: 'extend', current: makeSession() });

    await incomingEvent(buildJobData(), deps);

    expect(createdEvents(createEvent)[0]!.id).toBeUndefined();
  });

  test('emits session_start only once across 3 rapid events (new → extend → extend)', async () => {
    const { deps, createEvent, ingest, enqueueSessionEnd } = ctx;
    const session = makeSession({ id: newSessionId });
    ingest
      .mockResolvedValueOnce({ kind: 'new', current: session })
      .mockResolvedValueOnce({ kind: 'extend', current: session })
      .mockResolvedValueOnce({ kind: 'extend', current: session });

    for (const name of ['e1', 'e2', 'e3']) {
      await incomingEvent(
        buildJobData({
          event: {
            name,
            timestamp: new Date().toISOString(),
            isTimestampFromThePast: false,
            properties: { __path: 'https://example.com/test' },
          },
        }),
        deps
      );
    }

    const sessionStartCalls = createdEvents(createEvent).filter(
      (a) => a.name === 'session_start'
    );
    expect(sessionStartCalls).toHaveLength(1);
    expect(enqueueSessionEnd).not.toHaveBeenCalled();
  });
});

/**
 * M21-001. The marker replaces the offset watermark, which drill 08 showed
 * could not see any of the 161 duplicates it measured. MARK MEANS COUNT AND
 * LOG: every test below asserts the event was still INSERTED.
 */
describe('duplicate marker', () => {
  const TTL_MS = 120_000;
  const OTHER_EVENT_ID = '99999999-8888-4777-8666-555555555555';

  /**
   * Enough of Redis for `SET key NX PX`, with a hand-driven clock so the
   * expiry is asserted rather than slept through. The REAL marker runs against
   * it, so the key shape and the `NX` semantics are under test too.
   */
  function fakeRedis() {
    const keys = new Map<string, number>();
    let nowMs = 0;
    return {
      advance: (ms: number) => {
        nowMs += ms;
      },
      keyCount: () => {
        for (const [key, expiresAt] of keys) {
          if (expiresAt <= nowMs) {
            keys.delete(key);
          }
        }
        return keys.size;
      },
      set: (key: string, _value: string, _px: 'PX', ttlMs: number) => {
        const expiresAt = keys.get(key);
        if (expiresAt !== undefined && expiresAt > nowMs) {
          return Promise.resolve(null);
        }
        keys.set(key, nowMs + ttlMs);
        return Promise.resolve('OK');
      },
    };
  }

  function depsWithRealMarker() {
    const redis = fakeRedis();
    const built = makeDeps();
    built.deps.markDuplicate = createDuplicateEventMarker({
      client: redis,
      ttlMs: TTL_MS,
    });
    return { ...built, redis };
  }

  test('marks the second delivery of one id, and inserts BOTH', async () => {
    const { deps, createEvent, ingest, duplicateMarked } = depsWithRealMarker();
    ingest.mockResolvedValue({ kind: 'extend', current: makeSession() });
    const envelope = buildJobData({ id: producedEventId });

    await incomingEvent(envelope, deps);
    expect(duplicateMarked).not.toHaveBeenCalled();

    await incomingEvent(envelope, deps);
    expect(duplicateMarked).toHaveBeenCalledTimes(1);

    // The whole point: the redelivery is COUNTED, not suppressed. Two
    // inserts, both carrying the producer's id.
    const inserted = createdEvents(createEvent);
    expect(inserted).toHaveLength(2);
    expect(inserted.every((event) => event.id === producedEventId)).toBe(true);
  });

  test('never marks distinct ids', async () => {
    const { deps, createEvent, ingest, duplicateMarked } = depsWithRealMarker();
    ingest.mockResolvedValue({ kind: 'extend', current: makeSession() });

    await incomingEvent(buildJobData({ id: producedEventId }), deps);
    await incomingEvent(buildJobData({ id: OTHER_EVENT_ID }), deps);

    expect(duplicateMarked).not.toHaveBeenCalled();
    expect(createdEvents(createEvent)).toHaveLength(2);
  });

  test('the key expires, so a replay past the TTL is unmarked', async () => {
    const { deps, ingest, duplicateMarked, redis } = depsWithRealMarker();
    ingest.mockResolvedValue({ kind: 'extend', current: makeSession() });
    const envelope = buildJobData({ id: producedEventId });

    await incomingEvent(envelope, deps);
    expect(redis.keyCount()).toBe(1);

    redis.advance(TTL_MS + 1);
    expect(redis.keyCount()).toBe(0);

    await incomingEvent(envelope, deps);
    expect(duplicateMarked).not.toHaveBeenCalled();
  });

  test('a payload with no producer-minted id costs no Redis call', async () => {
    const { deps, createEvent, ingest, markDuplicate } = ctx;
    ingest.mockResolvedValueOnce({ kind: 'extend', current: makeSession() });

    await incomingEvent(buildJobData(), deps);

    expect(markDuplicate).not.toHaveBeenCalled();
    expect(createdEvents(createEvent)).toHaveLength(1);
  });

  /**
   * THE REGRESSION TEST THAT MATTERS. A blocking Redis call in this path is
   * how drill 02's consumer was evicted past its 30 s session timeout, and
   * M19 proved an eviction is the only reassignment that costs duplicate
   * rows. M18-003 removed that trigger; this must not put it back.
   */
  test('Redis unavailable: the event is processed normally and nothing throws', async () => {
    const { deps, createEvent, ingest, markDuplicate, duplicateMarked } = ctx;
    ingest.mockResolvedValueOnce({ kind: 'extend', current: makeSession() });
    markDuplicate.mockImplementation(() =>
      Promise.reject(
        new Error(
          "Stream isn't writeable and enableOfflineQueue options is false"
        )
      )
    );

    const event = await incomingEvent(
      buildJobData({ id: producedEventId }),
      deps
    );

    expect(event).not.toBeNull();
    expect(createdEvents(createEvent)).toHaveLength(1);
    expect(createdEvents(createEvent)[0]!.id).toBe(producedEventId);
    // Fail open means fail SILENT to the counter: an unwritten marker is not
    // evidence of a duplicate.
    expect(duplicateMarked).not.toHaveBeenCalled();
  });

  test('the marker runs alongside the handler, never in front of it', async () => {
    // "Not slowed" asserted structurally rather than with a stopwatch: the
    // marker is started BEFORE the handler's own Redis work and awaited
    // AFTER it, so a slow marker overlaps a slow session read instead of
    // adding to it. A serial check would give mark:start, mark:end,
    // ingest:start — which is the shape that would put M18-003's eviction
    // trigger back.
    const timeline: string[] = [];
    const slow = () => new Promise((resolve) => setTimeout(resolve, 20));
    const { deps, ingest, markDuplicate } = ctx;
    markDuplicate.mockImplementation(async () => {
      timeline.push('mark:start');
      await slow();
      timeline.push('mark:end');
      return false;
    });
    ingest.mockImplementation(async () => {
      timeline.push('ingest:start');
      await slow();
      timeline.push('ingest:end');
      return { kind: 'extend', current: makeSession() };
    });

    await incomingEvent(buildJobData({ id: producedEventId }), deps);

    expect(timeline.slice(0, 2)).toEqual(['mark:start', 'ingest:start']);
    expect(timeline).toContain('mark:end');
  });
});
