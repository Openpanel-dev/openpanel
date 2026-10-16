/** The capped dead-letter list at the Redis boundary: one MULTI, the record's shape, and the two ways a MULTI can fail without rejecting. Uses an in-memory stand-in with real list semantics. */

import { describe, expect, it } from 'vitest';
import {
  createDeadLetterRecorder,
  DEAD_LETTER_LIST_KEY,
  type DeadLetterMulti,
  type DeadLetterRecord,
  type DeadLetterRedisClient,
} from './dead-letter';

const OK: [Error | null, unknown] = [null, 1];
const MAX_ENTRIES = 3;

const input = (offset: string, overrides: Record<string, unknown> = {}) => ({
  key: Buffer.from('device-1'),
  value: Buffer.from(JSON.stringify({ projectId: 'p1', offset })),
  headers: {
    'request-id': Buffer.from('req-1'),
    attempts: ['1', '2'],
    plain: 'text',
  },
  topic: 'events',
  partition: 7,
  offset,
  reason: 'handler_error',
  error: 'handler exploded',
  ...overrides,
});

function fakeRedis() {
  const entries: string[] = [];
  const keysWritten: string[] = [];
  const trims: [number, number][] = [];
  let execs = 0;
  const client: DeadLetterRedisClient = {
    multi() {
      const queued: (() => void)[] = [];
      const chain: DeadLetterMulti = {
        lpush(key, value) {
          keysWritten.push(key);
          queued.push(() => entries.unshift(value));
          return chain;
        },
        ltrim(_key, start, stop) {
          trims.push([start, stop]);
          queued.push(() => entries.splice(stop + 1 - start));
          return chain;
        },
        async exec() {
          execs += 1;
          for (const run of queued) {
            run();
          }
          return queued.map(() => OK);
        },
      };
      return chain;
    },
  };
  return {
    client,
    keysWritten,
    trims,
    execs: () => execs,
    records: () => entries.map((raw) => JSON.parse(raw) as DeadLetterRecord),
  };
}

describe('createDeadLetterRecorder', () => {
  it('writes one record per event in a single round trip', async () => {
    const redis = fakeRedis();
    const record = createDeadLetterRecorder({
      client: redis.client,
      maxEntries: MAX_ENTRIES,
    });

    await record(input('100'));

    expect(redis.execs()).toBe(1);
    expect(redis.keysWritten).toEqual([DEAD_LETTER_LIST_KEY]);
    expect(redis.trims).toEqual([[0, MAX_ENTRIES - 1]]);
  });

  it('stores the coordinates, the reason, the error and the raw payload', async () => {
    const redis = fakeRedis();
    const record = createDeadLetterRecorder({
      client: redis.client,
      maxEntries: MAX_ENTRIES,
    });

    await record(input('100'));

    const [stored] = redis.records();
    expect(stored).toMatchObject({
      topic: 'events',
      partition: 7,
      offset: '100',
      reason: 'handler_error',
      error: 'handler exploded',
      key: 'device-1',
      // Buffer and array header values come back as text, not as `{"type":"Buffer"}`.
      headers: { 'request-id': 'req-1', attempts: '1,2', plain: 'text' },
    });
    expect(JSON.parse(stored?.value ?? '')).toMatchObject({ projectId: 'p1' });
    expect(Number.isNaN(Date.parse(stored?.recordedAt ?? ''))).toBe(false);
  });

  it('keeps a message with no key and no value at all', async () => {
    const redis = fakeRedis();
    const record = createDeadLetterRecorder({
      client: redis.client,
      maxEntries: MAX_ENTRIES,
    });

    await record(input('100', { key: null, value: null, headers: undefined }));

    expect(redis.records()[0]).toMatchObject({
      key: null,
      value: null,
      headers: {},
    });
  });

  it('keeps only the last N, newest first', async () => {
    const redis = fakeRedis();
    const record = createDeadLetterRecorder({
      client: redis.client,
      maxEntries: MAX_ENTRIES,
    });

    for (const offset of ['1', '2', '3', '4', '5']) {
      await record(input(offset));
    }

    expect(redis.records().map((stored) => stored.offset)).toEqual([
      '5',
      '4',
      '3',
    ]);
  });

  it('rejects on a per-command error, which a MULTI does not itself reject for', async () => {
    const wrongType = new Error('WRONGTYPE Operation against a key holding…');
    const client: DeadLetterRedisClient = {
      multi() {
        const chain: DeadLetterMulti = {
          lpush: () => chain,
          ltrim: () => chain,
          exec: () => Promise.resolve([[wrongType, null], OK]),
        };
        return chain;
      },
    };
    const record = createDeadLetterRecorder({
      client,
      maxEntries: MAX_ENTRIES,
    });

    await expect(record(input('100'))).rejects.toThrow(wrongType);
  });

  it('rejects when the MULTI is discarded', async () => {
    const client: DeadLetterRedisClient = {
      multi() {
        const chain: DeadLetterMulti = {
          lpush: () => chain,
          ltrim: () => chain,
          exec: () => Promise.resolve(null),
        };
        return chain;
      },
    };
    const record = createDeadLetterRecorder({
      client,
      maxEntries: MAX_ENTRIES,
    });

    await expect(record(input('100'))).rejects.toThrow('discarded by Redis');
  });
});
