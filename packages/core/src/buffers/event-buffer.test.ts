import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test';
import type { Readable } from 'node:stream';
import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';
import { getRedisCache } from '@openpanel/redis';
import { bufferDepsWithCh } from '../../test/buffer-fixtures';
import { testCoreConfig } from '../../test/config-fixture';

const realChQuery = { ...(await import('../ch-query')) };

const chInsert = mock(async (_options: unknown): Promise<unknown> => undefined);
const chQuery = mock(
  async (_query: string | SqlFragment): Promise<unknown[]> => []
);

// Inserts go through `BufferDeps.ch` (no module mock needed); reads go through
// core's `chQuery`, mocked here instead of `@openpanel/db`'s client, whose
// import builds a real client and a pino transport thread per test file.
mock.module('../ch-query', () => ({
  ...realChQuery,
  chQuery: (_scope: unknown, query: string | SqlFragment) => chQuery(query),
}));

const { EventBuffer, extractProjectId } = await import('./event-buffer');
type EventBuffer = InstanceType<typeof EventBuffer>;

/** Drain an object-mode Readable into an array of line strings. event-buffer
 *  yields each JSONEachRow row as its own string chunk; the @clickhouse/client
 *  adds the trailing '\n' itself via encodeJSON. So in production each `\n` is
 *  added by the client, but here we just collect chunks 1:1. */
async function streamToLines(stream: Readable): Promise<string[]> {
  const lines: string[] = [];
  for await (const chunk of stream) {
    lines.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
  }
  return lines;
}

const redis = getRedisCache();

beforeEach(async () => {
  const keys = await redis.keys('event*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  chInsert.mockClear();
  chQuery.mockClear();
});

// The shared `getRedisCache()` client is deliberately NOT quit here: bun runs
// every file in one process, and closing the singleton takes it away from the
// files that run next.
afterAll(() => {
  mock.module('../ch-query', () => realChQuery);
});

/** `testCoreConfig()` leaves `microBatchSize` undefined, so the buffer's own default applies. */
const DEFAULT_MICRO_BATCH_SIZE = 100;

describe('EventBuffer', () => {
  let eventBuffer: EventBuffer;

  beforeEach(() => {
    eventBuffer = new EventBuffer(bufferDepsWithCh({ insert: chInsert }));
  });

  it('adds regular event directly to buffer queue', async () => {
    const event = {
      project_id: 'p1',
      profile_id: 'u1',
      name: 'custom_event',
      created_at: new Date().toISOString(),
    } as any;

    const initialCount = await eventBuffer.getBufferSize();

    eventBuffer.add(event);
    await eventBuffer.flush();

    const newCount = await eventBuffer.getBufferSize();
    expect(newCount).toBe(initialCount + 1);
  });

  it('adds screen_view directly to buffer queue', async () => {
    const t0 = Date.now();
    const sessionId = 'session_1';

    const view1 = {
      project_id: 'p1',
      profile_id: 'u1',
      session_id: sessionId,
      name: 'screen_view',
      created_at: new Date(t0).toISOString(),
    } as any;

    const view2 = {
      project_id: 'p1',
      profile_id: 'u1',
      session_id: sessionId,
      name: 'screen_view',
      created_at: new Date(t0 + 1000).toISOString(),
    } as any;

    const count1 = await eventBuffer.getBufferSize();

    eventBuffer.add(view1);
    await eventBuffer.flush();

    // screen_view goes directly to buffer
    const count2 = await eventBuffer.getBufferSize();
    expect(count2).toBe(count1 + 1);

    eventBuffer.add(view2);
    await eventBuffer.flush();

    const count3 = await eventBuffer.getBufferSize();
    expect(count3).toBe(count1 + 2);
  });

  it('adds session_end directly to buffer queue', async () => {
    const t0 = Date.now();
    const sessionId = 'session_2';

    const view = {
      project_id: 'p2',
      profile_id: 'u2',
      session_id: sessionId,
      name: 'screen_view',
      created_at: new Date(t0).toISOString(),
    } as any;

    const sessionEnd = {
      project_id: 'p2',
      profile_id: 'u2',
      session_id: sessionId,
      name: 'session_end',
      created_at: new Date(t0 + 5000).toISOString(),
    } as any;

    const count1 = await eventBuffer.getBufferSize();

    eventBuffer.add(view);
    eventBuffer.add(sessionEnd);
    await eventBuffer.flush();

    const count2 = await eventBuffer.getBufferSize();
    expect(count2).toBe(count1 + 2);
  });

  it('gets buffer count correctly', async () => {
    expect(await eventBuffer.getBufferSize()).toBe(0);

    eventBuffer.add({
      project_id: 'p6',
      name: 'event1',
      created_at: new Date().toISOString(),
    } as any);
    await eventBuffer.flush();
    expect(await eventBuffer.getBufferSize()).toBe(1);

    eventBuffer.add({
      project_id: 'p6',
      name: 'event2',
      created_at: new Date().toISOString(),
    } as any);
    await eventBuffer.flush();
    expect(await eventBuffer.getBufferSize()).toBe(2);

    // screen_view also goes directly to buffer
    eventBuffer.add({
      project_id: 'p6',
      profile_id: 'u6',
      session_id: 'session_6',
      name: 'screen_view',
      created_at: new Date().toISOString(),
    } as any);
    await eventBuffer.flush();
    expect(await eventBuffer.getBufferSize()).toBe(3);
  });

  it('processes buffer and inserts events into ClickHouse', async () => {
    const event1 = {
      project_id: 'p7',
      name: 'event1',
      created_at: new Date(Date.now()).toISOString(),
    } as any;

    const event2 = {
      project_id: 'p7',
      name: 'event2',
      created_at: new Date(Date.now() + 1000).toISOString(),
    } as any;

    eventBuffer.add(event1);
    eventBuffer.add(event2);
    await eventBuffer.flush();

    expect(await eventBuffer.getBufferSize()).toBe(2);

    await eventBuffer.processBuffer();

    expect(chInsert).toHaveBeenCalled();
    const callArgs = chInsert.mock.calls[0]![0] as {
      format: string;
      table: string;
      values: unknown;
    };
    expect(callArgs.format).toBe('JSONEachRow');
    expect(callArgs.table).toBe('events');
    // `values` is an object-mode Readable of pre-serialized JSONEachRow lines.
    // Object mode is mandatory: @clickhouse/client rejects byte streams for
    // JSON* formats.
    const stream = callArgs.values as Readable;
    expect(stream.readableObjectMode).toBe(true);
    const lines = await streamToLines(stream);
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]!).name).toBe('event1');
    expect(JSON.parse(lines[1]!).name).toBe('event2');

    expect(await eventBuffer.getBufferSize()).toBe(0);
  });

  it('processes buffer with chunking', async () => {
    const base = testCoreConfig();
    const eb = new EventBuffer(
      bufferDepsWithCh(
        { insert: chInsert },
        testCoreConfig({
          buffers: {
            ...base.buffers,
            event: { ...base.buffers.event, chunkSize: 2 },
          },
        })
      )
    );

    for (let i = 0; i < 4; i++) {
      eb.add({
        project_id: 'p8',
        name: `event${i}`,
        created_at: new Date(Date.now() + i).toISOString(),
      } as any);
    }
    await eb.flush();

    await eb.processBuffer();

    expect(chInsert).toHaveBeenCalledTimes(2);
    const call1 = await streamToLines(
      (chInsert.mock.calls[0]![0] as { values: Readable }).values
    );
    const call2 = await streamToLines(
      (chInsert.mock.calls[1]![0] as { values: Readable }).values
    );
    expect(call1.length).toBe(2);
    expect(call2.length).toBe(2);
  });

  it('tracks active visitors', async () => {
    chQuery.mockResolvedValueOnce([{ count: 2 }]);

    const count = await eventBuffer.getActiveVisitorCount('p9');
    expect(count).toBe(2);
    expect(chQuery).toHaveBeenCalledTimes(1);
    const { query, query_params } = (
      chQuery.mock.calls[0]![0] as SqlFragment
    ).toStatement();
    expect(query).toContain('project_id = {p1:String}');
    expect(query_params.p1).toBe('p9');
  });

  it('handles multiple sessions independently — all events go to buffer', async () => {
    const t0 = Date.now();
    const count1 = await eventBuffer.getBufferSize();

    eventBuffer.add({
      project_id: 'p10',
      profile_id: 'u10',
      session_id: 'session_10a',
      name: 'screen_view',
      created_at: new Date(t0).toISOString(),
    } as any);
    eventBuffer.add({
      project_id: 'p10',
      profile_id: 'u11',
      session_id: 'session_10b',
      name: 'screen_view',
      created_at: new Date(t0).toISOString(),
    } as any);
    eventBuffer.add({
      project_id: 'p10',
      profile_id: 'u10',
      session_id: 'session_10a',
      name: 'screen_view',
      created_at: new Date(t0 + 1000).toISOString(),
    } as any);
    eventBuffer.add({
      project_id: 'p10',
      profile_id: 'u11',
      session_id: 'session_10b',
      name: 'screen_view',
      created_at: new Date(t0 + 2000).toISOString(),
    } as any);
    await eventBuffer.flush();

    // All 4 events are in buffer directly
    expect(await eventBuffer.getBufferSize()).toBe(count1 + 4);
  });

  it('bulk adds events to buffer', async () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      project_id: 'p11',
      name: `event${i}`,
      created_at: new Date(Date.now() + i).toISOString(),
    })) as any[];

    eventBuffer.bulkAdd(events);
    await eventBuffer.flush();

    expect(await eventBuffer.getBufferSize()).toBe(5);
  });

  // The shutdown path has to be able to see a failed rpush, because it
  // decides whether to commit the Kafka offsets on the answer. `flush`
  // deliberately swallows one (the micro-batch timer retries while the
  // process lives); `flushPendingOrThrow` does not.
  describe('flushPendingOrThrow', () => {
    // A failed flush re-queues its events AND arms the micro-batch timer, so
    // without this the retry lands in whichever test runs next.
    afterEach(async () => {
      await redis.del('event_buffer:queue');
      for (let attempt = 0; attempt < 5; attempt++) {
        if (eventBuffer.getPendingLocalCount() === 0) {
          break;
        }
        await eventBuffer.flush();
      }
      await redis.del('event_buffer:queue');
    });

    it('pushes the pending micro-batch to Redis and resolves', async () => {
      eventBuffer.add({
        project_id: 'p13',
        name: 'event1',
        created_at: new Date().toISOString(),
      } as any);
      expect(eventBuffer.getPendingLocalCount()).toBe(1);

      await eventBuffer.flushPendingOrThrow();

      expect(eventBuffer.getPendingLocalCount()).toBe(0);
      expect(await eventBuffer.getBufferSize()).toBe(1);
    });

    it('throws when the rpush does not land, and keeps the events', async () => {
      // A string under the list key makes every rpush fail with WRONGTYPE —
      // a real Redis refusal, without mocking the client out from under the
      // buffer. ioredis RESOLVES such a MULTI, so this is also the regression
      // test for reading the per-command errors.
      await redis.set('event_buffer:queue', 'not a list');

      eventBuffer.add({
        project_id: 'p14',
        name: 'event1',
        created_at: new Date().toISOString(),
      } as any);

      await expect(eventBuffer.flushPendingOrThrow()).rejects.toThrow(
        'WRONGTYPE'
      );
      expect(eventBuffer.getPendingLocalCount()).toBe(1);
    });

    it('waits for an in-flight micro-batch, then pushes what arrived during it', async () => {
      // The two-pass path: a write already in flight may have started before
      // the last `add()`, so waiting for it is not enough — a second write has
      // to be STARTED. Crossing `microBatchSize` puts one in flight
      // synchronously, and the event added right after it is the one that
      // would otherwise be resolved-then-lost.
      const inFlightBatch = DEFAULT_MICRO_BATCH_SIZE;
      for (let index = 0; index < inFlightBatch; index++) {
        eventBuffer.add({
          project_id: 'p16',
          name: 'in-flight',
          created_at: new Date().toISOString(),
        } as any);
      }
      eventBuffer.add({
        project_id: 'p16',
        name: 'arrived-during-the-write',
        created_at: new Date().toISOString(),
      } as any);
      expect(eventBuffer.getPendingLocalCount()).toBe(1);

      await eventBuffer.flushPendingOrThrow();

      expect(eventBuffer.getPendingLocalCount()).toBe(0);
      expect(await eventBuffer.getBufferSize()).toBe(inFlightBatch + 1);
    });

    it('does not throw through flush(), which retries instead', async () => {
      await redis.set('event_buffer:queue', 'not a list');

      eventBuffer.add({
        project_id: 'p15',
        name: 'event1',
        created_at: new Date().toISOString(),
      } as any);

      await eventBuffer.flush();

      expect(eventBuffer.getPendingLocalCount()).toBe(1);
    });
  });

  // The gate has to answer "are my events in Redis?", not "did I start the
  // write?". Answering the second question caused real durability failures
  // on a healthy stack and turned accepted events into duplicates, because a
  // caller that lost the race to start a write was told its already-durable
  // events were not durable.
  describe('flushPendingOrThrow under concurrency', () => {
    // 24 mirrors the number of Kafka partitions; the callers stand in for its
    // `eachBatch` handlers, and the background producer stands in for the
    // HTTP path and the session-end job adding events underneath them.
    const CONCURRENT_CALLERS = 24;
    const ROUNDS_PER_CALLER = 25;
    const EVENTS_PER_ROUND = 5;

    let addedEventCount = 0;

    const addEvent = (name: string) => {
      addedEventCount += 1;
      eventBuffer.add({
        project_id: 'p17',
        name,
        created_at: new Date().toISOString(),
      } as any);
    };

    beforeEach(() => {
      addedEventCount = 0;
    });

    afterEach(async () => {
      await redis.del('event_buffer:queue');
      for (let attempt = 0; attempt < 5; attempt++) {
        if (eventBuffer.getPendingLocalCount() === 0) {
          break;
        }
        await eventBuffer.flush();
      }
      await redis.del('event_buffer:queue');
    });

    it('resolves every concurrent caller, with zero spurious rejections', async () => {
      let producing = true;
      const backgroundProducer = (async () => {
        while (producing) {
          addEvent('background');
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      })();

      const rejections: unknown[] = [];
      await Promise.all(
        Array.from({ length: CONCURRENT_CALLERS }, async () => {
          for (let round = 0; round < ROUNDS_PER_CALLER; round++) {
            for (let index = 0; index < EVENTS_PER_ROUND; index++) {
              addEvent('batch');
            }
            try {
              await eventBuffer.flushPendingOrThrow();
            } catch (error) {
              rejections.push(error);
            }
          }
        })
      );
      producing = false;
      await backgroundProducer;

      expect(rejections).toEqual([]);
      await eventBuffer.flushPendingOrThrow();
      expect(eventBuffer.getPendingLocalCount()).toBe(0);
      expect(await eventBuffer.getBufferSize()).toBe(addedEventCount);
    });

    it('resolves a caller whose events someone else is already writing', async () => {
      addEvent('written-by-someone-else');
      addEvent('also-written-by-someone-else');

      // `flush()` starts the write synchronously, and a write always takes the
      // WHOLE pending array — so by the time this caller asks, its events are
      // in a write it did not start. That is a success, not a failure.
      const someoneElsesWrite = eventBuffer.flush();
      expect(eventBuffer.getPendingLocalCount()).toBe(0);

      await eventBuffer.flushPendingOrThrow();

      expect(await eventBuffer.getBufferSize()).toBe(addedEventCount);
      await someoneElsesWrite;
    });

    it('still rejects every concurrent caller when Redis genuinely refuses', async () => {
      await redis.set('event_buffer:queue', 'not a list');

      const results = await Promise.allSettled(
        Array.from({ length: CONCURRENT_CALLERS }, async () => {
          addEvent('doomed');
          await eventBuffer.flushPendingOrThrow();
        })
      );

      expect(results.every((result) => result.status === 'rejected')).toBe(
        true
      );
      for (const result of results) {
        expect((result as PromiseRejectedResult).reason.message).toContain(
          'WRONGTYPE'
        );
      }
      // Nothing was dropped on the way to being refused.
      expect(eventBuffer.getPendingLocalCount()).toBe(addedEventCount);
    });
  });

  // A failed flush leaves the batch's Kafka offsets unresolved and the
  // fail-fast cache client brings the redelivery back quickly. Re-queueing
  // the failed events then holds one copy per lap — a single outage can turn
  // a handful of events into thousands of duplicate ClickHouse rows.
  describe('events a redelivery will produce again', () => {
    const REDELIVERY_LAPS = 5;

    /** One Kafka message's event. A redelivery builds an equal, NEW object. */
    const kafkaEvent = (name = 'redelivered') =>
      ({
        project_id: 'p18',
        name,
        created_at: '2026-09-13 20:50:31',
      }) as any;

    const queuedNames = async (): Promise<string[]> =>
      (await redis.lrange('event_buffer:queue', 0, -1)).map(
        (row) => (JSON.parse(row) as { name: string }).name
      );

    it('keeps ONE copy when the same message is redelivered through a whole outage', async () => {
      await redis.set('event_buffer:queue', 'not a list');

      for (let lap = 0; lap < REDELIVERY_LAPS; lap++) {
        const isDurable = eventBuffer.openDurabilityWindow();
        eventBuffer.addRedeliverable(kafkaEvent());
        await expect(isDurable()).rejects.toThrow('WRONGTYPE');
        // Nothing is held for a later retry: Kafka owns that now.
        expect(eventBuffer.getPendingLocalCount()).toBe(0);
      }

      await redis.del('event_buffer:queue');
      const isDurable = eventBuffer.openDurabilityWindow();
      eventBuffer.addRedeliverable(kafkaEvent());
      await isDurable();

      expect(await eventBuffer.getBufferSize()).toBe(1);
    });

    it('still holds the events of a producer nothing redelivers', async () => {
      await redis.set('event_buffer:queue', 'not a list');

      const isDurable = eventBuffer.openDurabilityWindow();
      eventBuffer.addRedeliverable(kafkaEvent('from-the-consumer'));
      // The session-end job's write: a BullMQ retry re-runs a job whose Redis
      // `SET NX` claim is already taken, so this copy is the only one there is.
      eventBuffer.add(kafkaEvent('from-the-session-end-job'));

      await expect(isDurable()).rejects.toThrow('WRONGTYPE');
      expect(eventBuffer.getPendingLocalCount()).toBe(1);

      await redis.del('event_buffer:queue');
      await eventBuffer.flush();

      expect(await queuedNames()).toEqual(['from-the-session-end-job']);
    });

    it('rejects the window whose events a write it never awaited dropped', async () => {
      // The load-bearing case. The micro-batch timer can start — and fail —
      // the write while the batch is still handling messages, so by the time
      // the gate is asked there is nothing pending and Redis may be healthy
      // again. Answering "everything queued is settled" would commit the
      // batch and lose it for good.
      await redis.set('event_buffer:queue', 'not a list');

      const isDurable = eventBuffer.openDurabilityWindow();
      eventBuffer.addRedeliverable(kafkaEvent());
      await eventBuffer.flush();
      expect(eventBuffer.getPendingLocalCount()).toBe(0);

      await redis.del('event_buffer:queue');

      await expect(isDurable()).rejects.toThrow('WRONGTYPE');
      expect(await eventBuffer.getBufferSize()).toBe(0);
    });

    it('does not poison a window opened after the drop', async () => {
      await redis.set('event_buffer:queue', 'not a list');
      const doomed = eventBuffer.openDurabilityWindow();
      eventBuffer.addRedeliverable(kafkaEvent('doomed'));
      await expect(doomed()).rejects.toThrow('WRONGTYPE');

      await redis.del('event_buffer:queue');
      const healthy = eventBuffer.openDurabilityWindow();
      eventBuffer.addRedeliverable(kafkaEvent('healthy'));
      await healthy();

      expect(await queuedNames()).toEqual(['healthy']);
    });

    it("routes the consumer scope's add() through addRedeliverable", async () => {
      await redis.set('event_buffer:queue', 'not a list');
      const consumerView = eventBuffer.asRedeliverable();

      const isDurable = eventBuffer.openDurabilityWindow();
      consumerView.add(kafkaEvent());
      await expect(isDurable()).rejects.toThrow('WRONGTYPE');

      // Same buffer underneath, and the event was dropped rather than held.
      expect(consumerView.getPendingLocalCount()).toBe(0);
      expect(eventBuffer.getPendingLocalCount()).toBe(0);
    });
  });

  it('retains events in queue when ClickHouse insert fails', async () => {
    eventBuffer.add({
      project_id: 'p12',
      name: 'event1',
      created_at: new Date().toISOString(),
    } as any);
    await eventBuffer.flush();

    chInsert.mockRejectedValueOnce(new Error('ClickHouse unavailable'));

    // Errors propagate to tryFlush; the queue is preserved on CH failure.
    await expect(eventBuffer.processBuffer()).rejects.toThrow(
      'ClickHouse unavailable'
    );
    expect(await eventBuffer.getBufferSize()).toBe(1);
  });
});

describe('extractProjectId', () => {
  it('extracts the top-level project_id', () => {
    const line = JSON.stringify({
      id: 'evt1',
      name: 'foo',
      project_id: 'real-project',
    });
    expect(extractProjectId(line)).toBe('real-project');
  });

  it('returns null when the field is absent', () => {
    const line = JSON.stringify({ id: 'evt1', name: 'foo' });
    expect(extractProjectId(line)).toBeNull();
  });

  it('returns null on malformed input', () => {
    expect(extractProjectId('not json at all')).toBeNull();
    expect(extractProjectId('')).toBeNull();
  });

  it('returns null when project_id is empty', () => {
    // Empty string never matches `"project_id":"..."` — the value side
    // is at least one char, so this drops out cleanly.
    const line = JSON.stringify({ project_id: '' });
    expect(extractProjectId(line)).toBeNull();
  });

  it('falls back to JSON.parse when properties also has a project_id (after)', () => {
    // Top-level project_id is serialized first (event.service.ts order).
    // Fast path would still match it correctly here, but the helper
    // detects the second occurrence and routes to JSON.parse for safety.
    const line = JSON.stringify({
      id: 'evt1',
      project_id: 'real-project',
      properties: { project_id: 'user-supplied' },
    });
    expect(extractProjectId(line)).toBe('real-project');
  });

  it('falls back to JSON.parse when properties has project_id BEFORE top-level', () => {
    // If the field order in the event constructor ever changes, the fast path
    // would misattribute counts; two occurrences must resolve via JSON.parse.
    const line = JSON.stringify({
      properties: { project_id: 'user-supplied' },
      project_id: 'real-project',
    });
    expect(extractProjectId(line)).toBe('real-project');
  });

  it('does not confuse escaped quotes in a string value with the real field', () => {
    // A user types `"project_id":"x"` inside a property value. After
    // JSON.stringify, those quotes are escaped (`\"`), so the
    // indexOf scan for `"project_id":"` (no backslash) can't match
    // them. Only the real top-level field is found.
    const line = JSON.stringify({
      id: 'evt1',
      project_id: 'real-project',
      properties: { note: 'has "project_id":"fake" inside' },
    });
    expect(extractProjectId(line)).toBe('real-project');
  });

  it('handles a project_id nested deep inside properties (fallback path)', () => {
    const line = JSON.stringify({
      project_id: 'real-project',
      properties: { nested: { project_id: 'deep-fake' } },
    });
    expect(extractProjectId(line)).toBe('real-project');
  });
});
