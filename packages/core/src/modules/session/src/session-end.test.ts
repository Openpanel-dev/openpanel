// Covers the three-case logic (extended-after-enqueue skip, live vs snapshot,
// boundary), the first-writer idempotency claim, and that cleanup is id-gated
// to the closed session.

import { describe, expect, mock, test } from 'bun:test';
import { testCoreConfig } from '../../../../test/config-fixture';
import type { IServiceCreateEventPayload } from '../../event/event.service';
import {
  fixtureSession,
  stubLogger,
  stubRedis,
  stubStore,
} from './lifecycle.fixtures';
import {
  createSessionEnd,
  getSessionEndJobId,
  type SessionEndDeps,
  type SessionEndJobWire,
  sessionEndEnqueueOptions,
  sessionEndJobPayload,
} from './session-end';

const snapshot = fixtureSession();

/** The event as a handler receives it, after BullMQ's JSON round-trip. */
const payload = {
  projectId: 'proj-1',
  deviceId: 'dev-1',
  profileId: 'dev-1',
  name: 'session_end',
  properties: {},
} as unknown as SessionEndJobWire['event'];

/** The same fields on the producer side, where `createdAt` is still a Date. */
const producerPayload = payload as unknown as IServiceCreateEventPayload;

function makeDeps(live = snapshot as ReturnType<typeof fixtureSession> | null) {
  const redis = stubRedis();
  const sessions = stubStore(live);
  const createEvent = mock<SessionEndDeps['createEvent']>(async () => ({
    document: { id: 'evt-1' } as never,
  }));
  const deps: SessionEndDeps = {
    redis,
    sessions,
    logger: stubLogger(),
    config: testCoreConfig(),
    createEvent,
    transformEvent: (event) => event as never,
    transformSessionToEvent: () => ({}) as never,
    getEvents: mock(async () => []),
    profileBackfill: { add: mock(async () => undefined) },
    notifications: {
      getRules: mock(async () => []),
      hasFunnelRules: () => false,
      checkFunnelRules: mock(async () => undefined),
    },
  };
  return { deps, redis, sessions, createEvent };
}

describe('createSessionEnd', () => {
  test('emits session_end and id-gated cleanup on the happy path', async () => {
    // live == snapshot, unchanged
    const { deps, sessions, createEvent } = makeDeps(snapshot);

    const result = await createSessionEnd({ event: payload, snapshot }, deps);

    expect(result).toEqual({ id: 'evt-1' } as never);
    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(createEvent.mock.calls[0]?.[0]).toMatchObject({
      name: 'session_end',
      sessionId: 'sess-1',
      duration: 1_800_000,
      path: '/end',
      // ended_at + 1s
      createdAt: new Date('2026-06-08T11:00:01.000Z'),
    });
    expect(sessions.cleanup).toHaveBeenCalledWith({
      projectId: 'proj-1',
      deviceId: 'dev-1',
      sessionId: 'sess-1',
      profileId: 'dev-1',
    });
  });

  test('skips when the session was extended after the close was enqueued', async () => {
    const { deps, sessions, createEvent } = makeDeps(
      fixtureSession({ ended_at: '2026-06-08 11:05:00' })
    );

    const result = await createSessionEnd({ event: payload, snapshot }, deps);

    expect(result).toBeNull();
    expect(sessions.getExistingSession).toHaveBeenCalledTimes(1);
    expect(createEvent).not.toHaveBeenCalled();
    expect(sessions.cleanup).not.toHaveBeenCalled();
  });

  test('skips when the idempotency claim is already taken', async () => {
    const { deps, redis, createEvent } = makeDeps(snapshot);
    redis.set.mockResolvedValue(null); // SET NX failed → already emitted

    const result = await createSessionEnd({ event: payload, snapshot }, deps);

    expect(result).toBeNull();
    expect(redis.set).toHaveBeenCalledWith(
      'session:end:emitted:proj-1:dev-1:sess-1',
      '1',
      'EX',
      7200,
      'NX'
    );
    expect(createEvent).not.toHaveBeenCalled();
  });

  test('uses the snapshot when a new session already owns the slot (boundary)', async () => {
    // A boundary opened a fresh session under the same (project, device) slot.
    const { deps, sessions, createEvent } = makeDeps(
      fixtureSession({ id: 'sess-2', ended_at: '2026-06-08 12:00:00' })
    );

    await createSessionEnd({ event: payload, snapshot }, deps);

    // Emits for the CLOSED session (snapshot), not the live one.
    expect(createEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: 'sess-1',
    });
    // cleanup is keyed on the closed id → id-gated Lua no-ops against sess-2.
    expect(sessions.cleanup).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'sess-1' })
    );
  });

  test('falls back to the snapshot when the blob is gone', async () => {
    const { deps, createEvent } = makeDeps(null);

    const result = await createSessionEnd({ event: payload, snapshot }, deps);

    expect(result).toEqual({ id: 'evt-1' } as never);
    expect(createEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: 'sess-1',
    });
  });
});

describe('enqueue shape', () => {
  test('job id and options are pinned (sessionEnd:v2:<id>, 3 exponential retries)', () => {
    expect(getSessionEndJobId('sess-1')).toBe('sessionEnd:v2:sess-1');
    expect(sessionEndEnqueueOptions('sess-1')).toEqual({
      jobId: 'sessionEnd:v2:sess-1',
      attempts: 3,
      backoff: { type: 'exponential', delay: 200 },
    });
  });

  test('payload rewrites the event onto the closed session', () => {
    const closedSession = fixtureSession({
      id: 'sess-9',
      device_id: 'dev-9',
      profile_id: 'user-9',
    });

    expect(
      sessionEndJobPayload({ payload: producerPayload, closedSession })
    ).toEqual({
      event: {
        ...producerPayload,
        projectId: 'proj-1',
        deviceId: 'dev-9',
        sessionId: 'sess-9',
        profileId: 'user-9',
      },
      snapshot: closedSession,
    });
  });
});
