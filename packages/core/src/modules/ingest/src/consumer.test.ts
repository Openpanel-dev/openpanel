/**
 * Delivery contract of the Kafka events consumer (ADR-004): at-least-once.
 * An offset is resolved once its message has been handled, dead-lettered, or
 * deliberately skipped — never merely because it failed.
 *
 * Ported from apps/worker/src/jobs/events.kafka-consumer.test.ts (M8-003)
 * with the assertions unchanged. The batch handler is exercised directly with
 * injected dependencies; the broker, the metrics registry and `incomingEvent`
 * are all out of the picture — which is why no `mock.module` appears here.
 */

import { describe, expect, mock, test } from 'bun:test';
import type { EachBatchPayload, KafkaMessage } from 'kafkajs';
import {
  createEventsBatchHandler,
  type DeadLetterMessage,
  type EventsBatchHandlerDeps,
} from './consumer';

const PARTITION = 7;
const TOPIC = 'events';

const payloadFor = (offset: number) => ({
  projectId: `project-${offset}`,
  event: { name: 'screen_view' },
});

const message = (
  offset: number,
  key: string | null,
  value: string = JSON.stringify(payloadFor(offset))
): KafkaMessage =>
  ({
    key: key === null ? null : Buffer.from(key),
    value: value === '' ? null : Buffer.from(value),
    offset: String(offset),
    timestamp: '0',
    attributes: 0,
    headers: {},
    size: 0,
  }) as unknown as KafkaMessage;

function makeBatch(
  messages: KafkaMessage[],
  options: { isRunning?: () => boolean; isStale?: () => boolean } = {}
) {
  const resolveOffset = mock((_offset: string) => undefined);
  const heartbeat = mock(async () => undefined);
  const payload = {
    batch: { topic: TOPIC, partition: PARTITION, messages },
    resolveOffset,
    heartbeat,
    isRunning: options.isRunning ?? (() => true),
    isStale: options.isStale ?? (() => false),
  } as unknown as EachBatchPayload;
  return { payload, resolveOffset, heartbeat };
}

interface MockCalls {
  mock: { calls: unknown[][] };
}

const resolvedOffsets = (resolveOffset: MockCalls): string[] =>
  resolveOffset.mock.calls.map(([offset]) => offset as string);

function makeDeps(overrides: Partial<EventsBatchHandlerDeps> = {}) {
  const metrics: EventsBatchHandlerDeps['metrics'] = {
    reprocessed: mock(() => undefined),
    handlerFailed: mock(() => undefined),
    deadLettered: mock(() => undefined),
    deadLetterFailed: mock(() => undefined),
  };
  const handleEvent = mock<EventsBatchHandlerDeps['handleEvent']>(
    async () => undefined
  );
  const sendToDeadLetter = mock<EventsBatchHandlerDeps['sendToDeadLetter']>(
    async () => undefined
  );
  const sleep = mock(async (_ms: number) => undefined);
  const flushBufferedEvents = mock<
    EventsBatchHandlerDeps['flushBufferedEvents']
  >(async () => undefined);
  const deps: EventsBatchHandlerDeps = {
    handleEvent,
    sendToDeadLetter,
    flushBufferedEvents,
    logger: {
      info: mock(() => undefined),
      warn: mock(() => undefined),
      error: mock(() => undefined),
    },
    onActivity: mock(() => undefined),
    topic: TOPIC,
    maxAttempts: 3,
    initialRetryMs: 10,
    maxRetryMs: 25,
    sleep,
    ...overrides,
    metrics: { ...metrics, ...overrides.metrics },
  };
  return {
    deps,
    metrics: deps.metrics as typeof metrics,
    handleEvent,
    sendToDeadLetter: (overrides.sendToDeadLetter ??
      sendToDeadLetter) as typeof sendToDeadLetter,
    flushBufferedEvents: (overrides.flushBufferedEvents ??
      flushBufferedEvents) as typeof flushBufferedEvents,
    sleep,
  };
}

describe('offset walk', () => {
  test('resolves the whole contiguous prefix in ascending order', async () => {
    const { deps } = makeDeps();
    const handler = createEventsBatchHandler(deps);
    // Two interleaved key-groups: they run concurrently, so completion order
    // is not offset order — the walk must still resolve 0..3 ascending.
    const { payload, resolveOffset } = makeBatch([
      message(0, 'a'),
      message(1, 'b'),
      message(2, 'a'),
      message(3, 'b'),
    ]);

    await handler.eachBatch(payload);

    expect(resolvedOffsets(resolveOffset)).toEqual(['0', '1', '2', '3']);
  });

  test('stops at the first gap, even when later offsets did finish', async () => {
    // Keys 'a' (0, 2, 4) and 'b' (1, 3, 5) run concurrently. 'a' is held on
    // its first message until 'b' has finished all of its own, then the
    // consumer stops — so 3 and 5 are processed while 2 never runs. Resolving
    // them would ack offset 2 as well (last-write-wins) and lose it.
    let running = true;
    let releaseA = (): void => undefined;
    const bFinished = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const { deps, handleEvent } = makeDeps();
    handleEvent.mockImplementation(async (p: { projectId: string }) => {
      if (p.projectId === 'project-0') {
        await bFinished;
        running = false;
      }
      if (p.projectId === 'project-5') {
        releaseA();
      }
    });
    const handler = createEventsBatchHandler(deps);
    const { payload, resolveOffset } = makeBatch(
      [
        message(0, 'a'),
        message(1, 'b'),
        message(2, 'a'),
        message(3, 'b'),
        message(4, 'a'),
        message(5, 'b'),
      ],
      { isRunning: () => running }
    );

    await handler.eachBatch(payload);

    const handled = handleEvent.mock.calls.map(([p]) => p.projectId);
    expect(handled).toContain('project-5');
    expect(handled).not.toContain('project-2');
    expect(resolvedOffsets(resolveOffset)).toEqual(['0', '1']);
  });

  test('resolves nothing when the batch is stale before the first message', async () => {
    const { deps, handleEvent } = makeDeps();
    const handler = createEventsBatchHandler(deps);
    const { payload, resolveOffset } = makeBatch(
      [message(0, 'a'), message(1, 'a')],
      { isStale: () => true }
    );

    await handler.eachBatch(payload);

    expect(handleEvent).not.toHaveBeenCalled();
    expect(resolveOffset).not.toHaveBeenCalled();
  });
});

describe('kill consumer mid-batch', () => {
  test('loses no event: every unresolved offset is left for redelivery', async () => {
    const KILL_AFTER = 3;
    const TOTAL = 8;
    let handled = 0;
    let running = true;
    const { deps, handleEvent } = makeDeps();
    handleEvent.mockImplementation(async () => {
      handled += 1;
      if (handled >= KILL_AFTER) {
        running = false;
      }
    });
    const handler = createEventsBatchHandler(deps);
    // One key: strictly serial, so "killed after N" is deterministic.
    const messages = Array.from({ length: TOTAL }, (_, i) => message(i, 'a'));
    const { payload, resolveOffset } = makeBatch(messages, {
      isRunning: () => running,
    });

    await handler.eachBatch(payload);

    expect(handled).toBe(KILL_AFTER);
    expect(resolvedOffsets(resolveOffset)).toEqual(['0', '1', '2']);
    // The tail is not acked, so the broker redelivers it from offset 3.
    const unresolved = messages
      .slice(KILL_AFTER)
      .map((m) => m.offset)
      .filter((offset) => !resolvedOffsets(resolveOffset).includes(offset));
    expect(unresolved).toEqual(['3', '4', '5', '6', '7']);
  });
});

describe('handler failure', () => {
  test('retries with bounded backoff before giving up', async () => {
    const { deps, handleEvent, sleep, sendToDeadLetter } = makeDeps({
      maxAttempts: 4,
    });
    handleEvent.mockImplementation(() => Promise.reject(new Error('boom')));
    const handler = createEventsBatchHandler(deps);
    const { payload } = makeBatch([message(0, 'a')]);

    await handler.eachBatch(payload);

    expect(handleEvent).toHaveBeenCalledTimes(4);
    // 10 → 20 → 25 (clamped at maxRetryMs), and no sleep after the last try.
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([10, 20, 25]);
    expect(sendToDeadLetter).toHaveBeenCalledTimes(1);
  });

  test('stops retrying as soon as the handler succeeds', async () => {
    const { deps, handleEvent, sendToDeadLetter, metrics } = makeDeps();
    let attempts = 0;
    handleEvent.mockImplementation(() => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error('transient'))
        : Promise.resolve(undefined);
    });
    const handler = createEventsBatchHandler(deps);
    const { payload, resolveOffset } = makeBatch([message(0, 'a')]);

    await handler.eachBatch(payload);

    expect(handleEvent).toHaveBeenCalledTimes(2);
    expect(metrics.handlerFailed).toHaveBeenCalledTimes(1);
    expect(sendToDeadLetter).not.toHaveBeenCalled();
    expect(resolvedOffsets(resolveOffset)).toEqual(['0']);
  });

  test('dead-letters the raw message, counts it, and keeps the partition moving', async () => {
    const poison = 'poison-payload';
    const { deps, handleEvent, sendToDeadLetter, metrics } = makeDeps();
    handleEvent.mockImplementation(async (p: { projectId: string }) => {
      if (p.projectId === 'project-1') {
        throw new Error('handler exploded');
      }
    });
    const handler = createEventsBatchHandler(deps);
    const { payload, resolveOffset } = makeBatch([
      message(0, 'a'),
      message(1, 'a', JSON.stringify({ projectId: 'project-1', poison })),
      message(2, 'a'),
    ]);

    await handler.eachBatch(payload);

    const dlq = sendToDeadLetter.mock.calls[0]?.[0] as DeadLetterMessage;
    expect(dlq.reason).toBe('handler_error');
    expect(dlq.offset).toBe('1');
    expect(dlq.partition).toBe(PARTITION);
    expect(dlq.topic).toBe(TOPIC);
    // The raw producer bytes travel untouched, so the message is replayable.
    expect(JSON.parse(dlq.value?.toString() ?? '')).toMatchObject({ poison });

    expect(metrics.deadLettered).toHaveBeenCalledWith(
      String(PARTITION),
      'handler_error'
    );
    expect(metrics.handlerFailed).toHaveBeenCalledTimes(3);
    // The partition keeps moving: the poison offset and everything after it
    // are still resolved.
    expect(resolvedOffsets(resolveOffset)).toEqual(['0', '1', '2']);
  });

  test('leaves the offset unresolved when the dead-letter produce fails', async () => {
    const { deps, handleEvent, metrics } = makeDeps({
      sendToDeadLetter: mock(() => Promise.reject(new Error('broker down'))),
    });
    handleEvent.mockImplementation(async (p: { projectId: string }) => {
      if (p.projectId === 'project-1') {
        throw new Error('handler exploded');
      }
    });
    const handler = createEventsBatchHandler(deps);
    const { payload, resolveOffset } = makeBatch([
      message(0, 'a'),
      message(1, 'a'),
      message(2, 'a'),
    ]);

    await handler.eachBatch(payload);

    expect(metrics.deadLetterFailed).toHaveBeenCalledWith(String(PARTITION));
    // Nothing at or after the failed offset is acked — it is redelivered.
    expect(resolvedOffsets(resolveOffset)).toEqual(['0']);
  });
});

describe('unparseable messages', () => {
  test('dead-letters instead of dropping, without retrying', async () => {
    const { deps, handleEvent, sendToDeadLetter, metrics, sleep } = makeDeps();
    const handler = createEventsBatchHandler(deps);
    const { payload, resolveOffset } = makeBatch([
      message(0, 'a', 'not json at all'),
    ]);

    await handler.eachBatch(payload);

    expect(handleEvent).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
    expect(metrics.deadLettered).toHaveBeenCalledWith(
      String(PARTITION),
      'parse_error'
    );
    expect(
      (
        sendToDeadLetter.mock.calls[0]?.[0] as DeadLetterMessage
      ).value?.toString()
    ).toBe('not json at all');
    expect(resolvedOffsets(resolveOffset)).toEqual(['0']);
  });

  test('dead-letters a message with no value at all', async () => {
    const { deps, sendToDeadLetter, metrics } = makeDeps();
    const handler = createEventsBatchHandler(deps);
    const { payload, resolveOffset } = makeBatch([message(0, 'a', '')]);

    await handler.eachBatch(payload);

    expect(sendToDeadLetter).toHaveBeenCalledTimes(1);
    expect(metrics.deadLettered).toHaveBeenCalledWith(
      String(PARTITION),
      'parse_error'
    );
    expect(resolvedOffsets(resolveOffset)).toEqual(['0']);
  });
});

describe('reprocess counter', () => {
  test('does not fire for intra-batch out-of-order processing', async () => {
    const { deps, metrics } = makeDeps();
    const handler = createEventsBatchHandler(deps);
    const { payload } = makeBatch([
      message(0, 'a'),
      message(1, 'b'),
      message(2, 'a'),
    ]);

    await handler.eachBatch(payload);

    expect(metrics.reprocessed).not.toHaveBeenCalled();
  });

  test('fires once per redelivered offset in a later batch', async () => {
    const { deps, metrics } = makeDeps();
    const handler = createEventsBatchHandler(deps);
    const messages = [message(0, 'a'), message(1, 'a')];

    await handler.eachBatch(makeBatch(messages).payload);
    expect(metrics.reprocessed).not.toHaveBeenCalled();

    await handler.eachBatch(makeBatch(messages).payload);
    expect(metrics.reprocessed).toHaveBeenCalledTimes(2);
    expect(metrics.reprocessed).toHaveBeenCalledWith(String(PARTITION));
  });

  test('does not fire after a rebalance clears the watermarks', async () => {
    const { deps, metrics } = makeDeps();
    const handler = createEventsBatchHandler(deps);
    const messages = [message(0, 'a'), message(1, 'a')];

    await handler.eachBatch(makeBatch(messages).payload);
    handler.resetWatermarks();
    await handler.eachBatch(makeBatch(messages).payload);

    expect(metrics.reprocessed).not.toHaveBeenCalled();
  });

  test('does not fire for a dead-lettered offset re-seen only within the batch', async () => {
    // A dead-lettered offset is resolved, so it must move the watermark just
    // like a handled one — otherwise the next batch would flag it as a
    // reprocess.
    const { deps, handleEvent, metrics } = makeDeps();
    handleEvent.mockImplementation(() => Promise.reject(new Error('boom')));
    const handler = createEventsBatchHandler(deps);

    await handler.eachBatch(makeBatch([message(0, 'a')]).payload);
    expect(metrics.reprocessed).not.toHaveBeenCalled();

    await handler.eachBatch(makeBatch([message(1, 'a')]).payload);
    expect(metrics.reprocessed).not.toHaveBeenCalled();
  });
});

/**
 * The regression test for drill 03's loss (M18-001).
 *
 * The event a handler accepted lives in an in-process array until the buffer
 * pushes it to Redis, and kafkajs commits whatever `resolveOffset` marked the
 * moment `eachBatch` returns — `autoCommit` is on and this consumer never
 * turns it off, so `consumer.stop()` is NOT the commit point. Resolving an
 * offset for an event that is still only in memory is exactly how a graceful
 * restart lost 2 of 44,075 events: the offsets were committed, the process
 * exited, and nothing was redelivered.
 *
 * `resolveOffset` is therefore the commit in these tests. It is the only thing
 * that decides what gets committed.
 */
describe('durability before commit', () => {
  test('flushes the buffered events before it resolves any offset', async () => {
    const { payload, resolveOffset } = makeBatch([
      message(0, 'a'),
      message(1, 'b'),
    ]);
    let handled = 0;
    let resolvedWhenFlushed = -1;
    let handledWhenFlushed = -1;

    const { deps } = makeDeps({
      handleEvent: mock(async () => {
        handled += 1;
        return undefined;
      }),
      flushBufferedEvents: mock(async () => {
        resolvedWhenFlushed = resolveOffset.mock.calls.length;
        handledWhenFlushed = handled;
      }),
    });
    const handler = createEventsBatchHandler(deps);

    await handler.eachBatch(payload);

    // Nothing committed yet, and every message already handled — so the flush
    // covers the whole batch and none of it was committed behind its back.
    expect(resolvedWhenFlushed).toBe(0);
    expect(handledWhenFlushed).toBe(2);
    expect(resolvedOffsets(resolveOffset)).toEqual(['0', '1']);
  });

  test('resolves NO offset when the flush fails', async () => {
    const logger = {
      info: mock(() => undefined),
      warn: mock(() => undefined),
      error: mock(() => undefined),
    };
    const onActivity = mock(() => undefined);
    const { deps } = makeDeps({
      flushBufferedEvents: mock(() =>
        Promise.reject(new Error('redis is unreachable'))
      ),
      logger,
      onActivity,
    });
    const handler = createEventsBatchHandler(deps);
    const { payload, resolveOffset, heartbeat } = makeBatch([
      message(0, 'a'),
      message(1, 'b'),
    ]);

    await handler.eachBatch(payload);

    // The whole batch stays uncommitted, so the broker redelivers it. A
    // duplicate is recoverable; a loss is not.
    expect(resolvedOffsets(resolveOffset)).toEqual([]);
    expect(logger.error).toHaveBeenCalledTimes(1);
    // Still a member of the group, and still visibly alive.
    expect(heartbeat).toHaveBeenCalled();
    expect(onActivity).toHaveBeenCalledTimes(1);
  });

  test('redelivery after a failed flush commits, and is not flagged a duplicate', async () => {
    let redisIsDown = true;
    const { deps, metrics } = makeDeps({
      flushBufferedEvents: mock(async () => {
        if (redisIsDown) {
          throw new Error('redis is unreachable');
        }
      }),
    });
    const handler = createEventsBatchHandler(deps);

    const first = makeBatch([message(0, 'a'), message(1, 'b')]);
    await handler.eachBatch(first.payload);
    expect(resolvedOffsets(first.resolveOffset)).toEqual([]);

    redisIsDown = false;
    const redelivered = makeBatch([message(0, 'a'), message(1, 'b')]);
    await handler.eachBatch(redelivered.payload);

    expect(resolvedOffsets(redelivered.resolveOffset)).toEqual(['0', '1']);
    // The failed batch never advanced the watermark, so the replay it asked
    // for is not then reported as an at-least-once duplicate.
    expect(metrics.reprocessed).not.toHaveBeenCalled();
  });

  test('flushes what a shutdown-truncated batch handled, before resolving it', async () => {
    // Drill 03's shape: SIGTERM lands mid-batch, `isRunning` goes false, and
    // the handler resolves only the prefix it finished. That prefix must be
    // durable too — it is the window the graceful restart used to lose.
    let handled = 0;
    const flushBufferedEvents = mock(async () => undefined);
    const { deps } = makeDeps({
      flushBufferedEvents,
      handleEvent: mock(async () => {
        handled += 1;
        return undefined;
      }),
    });
    const handler = createEventsBatchHandler(deps);
    const { payload, resolveOffset } = makeBatch(
      [message(0, 'a'), message(1, 'a'), message(2, 'a')],
      { isRunning: () => handled < 2 }
    );

    await handler.eachBatch(payload);

    expect(resolvedOffsets(resolveOffset)).toEqual(['0', '1']);
    expect(flushBufferedEvents).toHaveBeenCalledTimes(1);
  });
});
