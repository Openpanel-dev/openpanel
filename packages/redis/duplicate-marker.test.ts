/** The event-keyed duplicate marker at the Redis boundary: one `SET key NX PX`, the key shape, and which reply means "seen before". Uses an in-memory stand-in with real `NX` and expiry semantics. */

import { describe, expect, it } from 'vitest';
import {
  createDuplicateEventMarker,
  DUPLICATE_MARKER_KEY_PREFIX,
  type DuplicateMarkerRedisClient,
} from './duplicate-marker';

const TTL_MS = 120_000;
const EVENT_ID = '11111111-2222-4333-8444-555555555555';
const OTHER_EVENT_ID = '99999999-8888-4777-8666-555555555555';

function fakeRedis() {
  const expiries = new Map<string, number>();
  const commands: unknown[][] = [];
  let nowMs = 0;

  const client: DuplicateMarkerRedisClient = {
    set(key, value, expiryMode, ttlMs, setMode) {
      commands.push([key, value, expiryMode, ttlMs, setMode]);
      const expiresAt = expiries.get(key);
      if (expiresAt !== undefined && expiresAt > nowMs) {
        return Promise.resolve(null);
      }
      expiries.set(key, nowMs + ttlMs);
      return Promise.resolve('OK');
    },
  };

  return {
    client,
    commands,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

describe('createDuplicateEventMarker', () => {
  it('reports the first sighting of an id as not-a-duplicate', async () => {
    const redis = fakeRedis();
    const mark = createDuplicateEventMarker({
      client: redis.client,
      ttlMs: TTL_MS,
    });

    expect(await mark(EVENT_ID)).toBe(false);
  });

  it('reports the second sighting of the same id as a duplicate', async () => {
    const redis = fakeRedis();
    const mark = createDuplicateEventMarker({
      client: redis.client,
      ttlMs: TTL_MS,
    });

    await mark(EVENT_ID);

    expect(await mark(EVENT_ID)).toBe(true);
  });

  it('keeps distinct ids independent', async () => {
    const redis = fakeRedis();
    const mark = createDuplicateEventMarker({
      client: redis.client,
      ttlMs: TTL_MS,
    });

    await mark(EVENT_ID);

    expect(await mark(OTHER_EVENT_ID)).toBe(false);
  });

  it('forgets an id once its key has expired', async () => {
    const redis = fakeRedis();
    const mark = createDuplicateEventMarker({
      client: redis.client,
      ttlMs: TTL_MS,
    });

    await mark(EVENT_ID);
    redis.advance(TTL_MS + 1);

    expect(await mark(EVENT_ID)).toBe(false);
  });

  it('costs exactly one command per event, a prefixed SET NX PX', async () => {
    const redis = fakeRedis();
    const mark = createDuplicateEventMarker({
      client: redis.client,
      ttlMs: TTL_MS,
    });

    await mark(EVENT_ID);

    expect(redis.commands).toEqual([
      [`${DUPLICATE_MARKER_KEY_PREFIX}${EVENT_ID}`, '1', 'PX', TTL_MS, 'NX'],
    ]);
  });

  it('takes a key prefix override without touching the default', async () => {
    const redis = fakeRedis();
    const mark = createDuplicateEventMarker({
      client: redis.client,
      ttlMs: TTL_MS,
      keyPrefix: 'test:dup:',
    });

    await mark(EVENT_ID);

    expect(redis.commands[0]![0]).toBe(`test:dup:${EVENT_ID}`);
    expect(DUPLICATE_MARKER_KEY_PREFIX).toBe('ingest:duplicate:');
  });

  it('rejects when Redis does not answer, leaving the decision to the caller', async () => {
    const mark = createDuplicateEventMarker({
      client: {
        set: () => Promise.reject(new Error('Stream is not writeable')),
      },
      ttlMs: TTL_MS,
    });

    await expect(mark(EVENT_ID)).rejects.toThrow('Stream is not writeable');
  });
});
