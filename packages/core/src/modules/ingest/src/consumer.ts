// Ported from apps/worker/src/jobs/events.kafka-consumer.ts (M8-003). The
// delivery contract is ADR-004's and is unchanged line for line: per-key
// serial groups, the ascending contiguous-prefix offset walk, at-least-once,
// bounded in-consumer retry, and a dead-letter topic on exhaustion.
//
// The kafkajs client, the topic/consumer-group names, the DLQ producer and
// the retry bounds are all INJECTED, and stay so now that they live one
// directory away in ./kafka.ts (M11-003): injection is what keeps those names
// byte-identical, because this file never spells one.

import type {
  Consumer,
  EachBatchPayload,
  IHeaders,
  KafkaMessage,
} from 'kafkajs';
import type { IncomingEventPayload } from './incoming-event';

export interface KafkaConsumerHandle {
  /**
   * Stop fetching, then wait for the in-flight `eachBatch` to finish. Split
   * out from `stop()` so a graceful shutdown has a point where nothing new can
   * enter the event buffer but the consumer has not been torn down yet — that
   * is where shutdown flushes whatever was buffered OUTSIDE a Kafka batch
   * (M18-001, drill 03). Events buffered inside one are already durable: see
   * `flushBufferedEvents` below.
   */
  stopConsuming: () => Promise<void>;
  /** Disconnect. Safe to call after `stopConsuming`, and without it. */
  stop: () => Promise<void>;
}

// Heartbeat every N messages within a per-key group. The default kafkajs
// sessionTimeout is 30s — calling heartbeat every 16 messages keeps us
// comfortably under that even for slow handlers.
const HEARTBEAT_EVERY = 16;

const RETRY_BACKOFF_FACTOR = 2;

/**
 * Ceiling on the wait a batch takes before it returns from a failed
 * durability flush and lets the broker redeliver it.
 *
 * The wait itself is seeded from `initialRetryMs` and doubled per consecutive
 * failure — the consumer's own retry convention — but it is capped HERE
 * rather than at `maxRetryMs`, which is sized for a flaky handler (1s by
 * default) and not for a dependency that is down. Without any cap a failed
 * flush redelivers in ~90ms and spins: drill 02's re-run measured ~162 laps
 * per message in one 96s outage, hammering Redis and Kafka at the worst
 * possible moment. 5s keeps a ~15s outage to single-digit redeliveries and
 * stays well below the 30s session timeout, so waiting cannot cost the
 * consumer its group membership (M18-007).
 */
const DURABILITY_RETRY_MAX_MS = 5000;

/** Why a message was dead-lettered. A label value — keep the set small. */
export type DeadLetterReason = 'parse_error' | 'handler_error';

/**
 * What the consumer hands to the dead-letter producer (./kafka.ts's
 * `produceDeadLetterEvent` is the one implementation): the value stays the
 * producer's original bytes, so a DLQ message can be replayed onto the events
 * topic unchanged.
 */
export interface DeadLetterMessage {
  key: Buffer | null;
  value: Buffer | null;
  headers?: IHeaders;
  topic: string;
  partition: number;
  offset: string;
  reason: string;
  error: string;
}

export interface ConsumerLogger {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

export interface ConsumerMetrics {
  reprocessed: (partition: string) => void;
  handlerFailed: (partition: string) => void;
  deadLettered: (partition: string, reason: DeadLetterReason) => void;
  deadLetterFailed: (partition: string) => void;
}

export interface EventsBatchHandlerDeps {
  handleEvent: (
    payload: IncomingEventPayload,
    meta: { partition: number; offset: string }
  ) => Promise<unknown>;
  sendToDeadLetter: (message: DeadLetterMessage) => Promise<void>;
  /**
   * Opens a durability window over the event buffer and returns the gate that
   * closes it — `EventBuffer.openDurabilityWindow`.
   *
   * Opened BEFORE the batch's first handler runs, and awaited once every
   * message has been handled and BEFORE the first `resolveOffset`, because
   * kafkajs commits the resolved offsets as soon as `eachBatch` returns
   * (`autoCommit` defaults to true and this consumer does not turn it off) —
   * not at `consumer.stop()`.
   *
   * The gate MUST reject when the events THIS batch buffered are not in
   * Redis: drill 03 lost 2 of 44,075 events on a graceful restart because the
   * offsets of events that existed only in the event buffer's in-process array
   * were committed anyway (M18-001). The window is what makes "this batch's"
   * answerable at all, now that a failed write drops the events it knows the
   * broker will redeliver instead of keeping them (M18-007).
   */
  openDurabilityWindow: () => () => Promise<void>;
  logger: ConsumerLogger;
  metrics: ConsumerMetrics;
  onActivity: () => void;
  topic: string;
  maxAttempts: number;
  initialRetryMs: number;
  maxRetryMs: number;
  /** Injected by the tests; production uses the timer below. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

export interface EventsBatchHandler {
  eachBatch: (payload: EachBatchPayload) => Promise<void>;
  /** Called on GROUP_JOIN: a new assignment invalidates the watermarks. */
  resetWatermarks: () => void;
}

/**
 * The `eachBatch` handler, with its dependencies injected so the offset walk,
 * the per-key serial groups and the failure paths are testable without a
 * broker.
 *
 * Delivery contract (ADR-004): at-least-once. An offset is resolved only once
 * its message has been handled, dead-lettered, or deliberately skipped —
 * never merely because it failed.
 */
export function createEventsBatchHandler(
  deps: EventsBatchHandlerDeps
): EventsBatchHandler {
  const sleep = deps.sleep ?? defaultSleep;

  // Highest Kafka offset we have *resolved* (committed) per `topic-partition`,
  // tracked across batches. Used purely for the reprocess detector below: if we
  // ever see an offset at or below this watermark again, the message is being
  // redelivered (at-least-once duplicate) outside of a rebalance — which is the
  // signature of an offset-handling bug. Cleared on GROUP_JOIN so legitimate
  // post-rebalance redelivery from the last committed offset doesn't trip it.
  const resolvedHWM = new Map<string, number>();

  const deadLetter = async (
    message: KafkaMessage,
    partition: number,
    reason: DeadLetterReason,
    err: unknown
  ): Promise<boolean> => {
    const label = String(partition);
    try {
      await deps.sendToDeadLetter({
        key: message.key,
        value: message.value,
        headers: message.headers,
        topic: deps.topic,
        partition,
        offset: message.offset,
        reason,
        error: errorMessage(err),
      });
    } catch (dlqErr) {
      // The event is not lost: leaving the offset unresolved stops the
      // contiguous-prefix walk here, so the broker redelivers this message.
      deps.metrics.deadLetterFailed(label);
      deps.logger.error(
        { err: dlqErr, partition, offset: message.offset, reason },
        'kafka dead-letter produce failed — offset left unresolved for redelivery'
      );
      return false;
    }
    deps.metrics.deadLettered(label, reason);
    deps.logger.error(
      { err, partition, offset: message.offset, reason },
      'kafka message dead-lettered'
    );
    return true;
  };

  const runHandlerWithRetry = async (
    payload: IncomingEventPayload,
    partition: number,
    offset: string
  ): Promise<{ ok: true } | { ok: false; err: unknown }> => {
    const label = String(partition);
    let delayMs = deps.initialRetryMs;
    let lastErr: unknown;

    for (let attempt = 1; attempt <= deps.maxAttempts; attempt++) {
      try {
        await deps.handleEvent(payload, { partition, offset });
        return { ok: true };
      } catch (err) {
        lastErr = err;
        deps.metrics.handlerFailed(label);
        deps.logger.warn(
          {
            err,
            partition,
            offset,
            projectId: payload.projectId,
            attempt,
            maxAttempts: deps.maxAttempts,
          },
          'kafka incomingEvent handler failed'
        );
        if (attempt < deps.maxAttempts) {
          await sleep(delayMs);
          delayMs = Math.min(delayMs * RETRY_BACKOFF_FACTOR, deps.maxRetryMs);
        }
      }
    }

    return { ok: false, err: lastErr };
  };

  /** @returns true when the offset may be resolved. */
  const processMessage = async (
    message: KafkaMessage,
    partition: number
  ): Promise<boolean> => {
    let payload: IncomingEventPayload;
    try {
      if (!message.value) {
        throw new Error('kafka message has no value');
      }
      payload = JSON.parse(message.value.toString()) as IncomingEventPayload;
    } catch (err) {
      deps.logger.error(
        { err, partition, offset: message.offset },
        'kafka message parse failed'
      );
      // Deterministic: retrying identical bytes cannot succeed.
      return deadLetter(message, partition, 'parse_error', err);
    }

    const result = await runHandlerWithRetry(
      payload,
      partition,
      message.offset
    );
    if (result.ok) {
      return true;
    }
    return deadLetter(message, partition, 'handler_error', result.err);
  };

  // Consecutive durability failures per `topic-partition`, for the backoff
  // below. Cleared the moment a batch's events are durable again.
  const durabilityFailures = new Map<string, number>();

  /**
   * @returns false when the flush failed, which leaves the watermark where it
   * was so the redelivered batch is not then reported as a duplicate.
   */
  const bufferedEventsAreDurable = async (
    partition: number,
    closeDurabilityWindow: () => Promise<void>
  ): Promise<boolean> => {
    try {
      await closeDurabilityWindow();
      return true;
    } catch (err) {
      deps.logger.error(
        { err, partition },
        'buffered events could not be made durable — batch left unresolved for redelivery'
      );
      return false;
    }
  };

  /**
   * Hold the partition before returning, so the redelivery this batch just
   * asked for does not arrive in ~90ms and fail the same way.
   */
  const waitForRedelivery = async (
    partitionKey: string,
    partition: number,
    heartbeat: () => Promise<void>
  ): Promise<void> => {
    const failures = (durabilityFailures.get(partitionKey) ?? 0) + 1;
    durabilityFailures.set(partitionKey, failures);
    const delayMs = Math.min(
      deps.initialRetryMs * RETRY_BACKOFF_FACTOR ** (failures - 1),
      DURABILITY_RETRY_MAX_MS
    );
    // Heartbeat first: a member that is deliberately waiting must not look
    // like one that has died.
    await heartbeat();
    deps.logger.warn(
      { partition, consecutiveFailures: failures, delayMs },
      'waiting before letting the broker redeliver the batch'
    );
    await sleep(delayMs);
  };

  const eachBatch = async ({
    batch,
    resolveOffset,
    heartbeat,
    isRunning,
    isStale,
  }: EachBatchPayload): Promise<void> => {
    if (batch.messages.length === 0) {
      return;
    }

    const pk = `${batch.topic}-${batch.partition}`;
    // Opened before the first handler buffers anything, so the gate answers
    // for THIS batch's events and not for whatever else was pending when it
    // finished (M18-007).
    const closeDurabilityWindow = deps.openDurabilityWindow();
    // Watermark from *previous* batches. Anything at or below this that we see
    // now is a redelivery. Captured before this batch so intra-batch
    // out-of-order processing (normal, see below) is never counted.
    const priorHWM = resolvedHWM.get(pk) ?? -1;

    // Group by partition key (= deviceId or `${projectId}:${profileId}`).
    // Same-key messages stay serial so sessionBuffer/session-end-job state
    // can't race; different keys run in parallel via Promise.all.
    // Keyless messages get their own singleton group.
    const groups = new Map<string, KafkaMessage[]>();
    for (const m of batch.messages) {
      const key = m.key ? m.key.toString() : `__no_key__:${m.offset}`;
      const arr = groups.get(key);
      if (arr) {
        arr.push(m);
      } else {
        groups.set(key, [m]);
      }
    }

    // Offsets that finished processing this batch. We resolve them AFTER all
    // groups complete, in strict ascending order (see the loop below).
    //
    // Why: KafkaJS `resolveOffset` is last-write-wins and the next fetch
    // starts from the last resolved offset (offsetManager.nextOffset). If we
    // resolved inside the concurrent per-key loop, a lower offset resolving
    // after a higher one would move the fetch position BACKWARDS and
    // re-deliver everything in between — the root cause of the duplicate
    // events. Resolving the contiguous ascending prefix at the end avoids
    // both duplicates (never regress) and loss (stop at the first gap).
    const processed = new Set<string>();
    let processedCount = 0;

    await Promise.all(
      [...groups.values()].map(async (msgs) => {
        for (const m of msgs) {
          if (!isRunning() || isStale()) {
            return;
          }

          // Reprocess detector: only fires for offsets already resolved in a
          // PRIOR batch (redelivery). Intra-batch out-of-order processing
          // across key-groups is expected and is not flagged.
          if (Number(m.offset) <= priorHWM) {
            deps.metrics.reprocessed(String(batch.partition));
            deps.logger.warn(
              {
                partition: batch.partition,
                offset: m.offset,
                resolvedHighWaterMark: priorHWM,
              },
              'kafka offset REPROCESSED — at-least-once duplicate (outside rebalance)'
            );
          }

          const resolvable = await processMessage(m, batch.partition);
          if (!resolvable) {
            // Stop this key-group: continuing past an unresolvable offset only
            // adds duplicates, since the whole tail is redelivered anyway.
            return;
          }

          processed.add(m.offset);
          processedCount += 1;
          if (processedCount % HEARTBEAT_EVERY === 0) {
            await heartbeat();
          }
        }
      })
    );

    // Durability before commit. Handled is not the same as safe: the events
    // are in an in-process array until they are pushed to Redis, and every
    // offset resolved below is committed the instant this handler returns. If
    // that push will not land, resolve NOTHING and let the broker redeliver
    // the whole batch — a duplicate is recoverable, a loss is not.
    if (
      await bufferedEventsAreDurable(batch.partition, closeDurabilityWindow)
    ) {
      durabilityFailures.delete(pk);
      // Resolve in strict ascending offset order, stopping at the first offset
      // that did not finish (e.g. an isStale/isRunning early-return mid-batch).
      // batch.messages is already ordered by offset.
      let newHWM = priorHWM;
      for (const m of batch.messages) {
        if (!processed.has(m.offset)) {
          break;
        }
        resolveOffset(m.offset);
        newHWM = Math.max(newHWM, Number(m.offset));
      }
      resolvedHWM.set(pk, newHWM);
    } else if (isRunning() && !isStale()) {
      // Not while shutting down: the redelivery is the next process's problem
      // and the wait would only eat the shutdown budget.
      await waitForRedelivery(pk, batch.partition, heartbeat);
    }

    await heartbeat();
    deps.onActivity();
  };

  return {
    eachBatch,
    resetWatermarks: () => {
      resolvedHWM.clear();
      durabilityFailures.clear();
    },
  };
}

/** The broker-facing half, supplied by whoever owns the kafkajs client. */
export interface EventsConsumerDeps {
  /** Already configured with the group id, timeouts and fetch bounds. */
  createConsumer: (options?: { groupId?: string }) => Consumer;
  /** Lifecycle / rebalance visibility. */
  logger: ConsumerLogger;
  /** The "consumer running" line, on the kafka-scoped logger. */
  kafkaLogger: ConsumerLogger;
  topic: string;
  partitionsConsumedConcurrently: number;
  batch: Omit<EventsBatchHandlerDeps, 'topic'>;
}

export async function startKafkaEventsConsumer(
  deps: EventsConsumerDeps
): Promise<KafkaConsumerHandle> {
  const { logger } = deps;
  const consumer = deps.createConsumer();
  const handler = createEventsBatchHandler({
    ...deps.batch,
    topic: deps.topic,
  });
  await consumer.connect();
  await consumer.subscribe({
    topic: deps.topic,
    fromBeginning: false,
  });

  consumer.on(consumer.events.HEARTBEAT, deps.batch.onActivity);

  // ---- Lifecycle / rebalance ("re-election") visibility ----
  // We had no logging for partition reassignment before; without it a rebalance
  // storm (a common source of at-least-once duplicates) is invisible.
  consumer.on(consumer.events.GROUP_JOIN, ({ payload }) => {
    // A new assignment means partitions may have moved between members; reset
    // the reprocess watermarks so legitimate resume-from-committed-offset after
    // a rebalance is not flagged as a duplicate.
    handler.resetWatermarks();
    logger.info(
      {
        memberId: payload.memberId,
        groupId: payload.groupId,
        isLeader: payload.isLeader,
        memberAssignment: payload.memberAssignment,
        duration: payload.duration,
      },
      'kafka consumer joined group (rebalance complete)'
    );
  });
  consumer.on(consumer.events.REBALANCING, ({ payload }) => {
    logger.warn(
      { memberId: payload.memberId, groupId: payload.groupId },
      'kafka consumer rebalancing'
    );
  });
  consumer.on(consumer.events.CRASH, ({ payload }) => {
    logger.error(
      {
        err: payload.error,
        groupId: payload.groupId,
        restart: payload.restart,
      },
      'kafka consumer crashed'
    );
  });
  consumer.on(consumer.events.DISCONNECT, () => {
    logger.warn({}, 'kafka consumer disconnected');
  });
  consumer.on(consumer.events.REQUEST_TIMEOUT, ({ payload }) => {
    logger.warn(
      { broker: payload.broker, clientId: payload.clientId },
      'kafka consumer request timeout'
    );
  });

  await consumer.run({
    partitionsConsumedConcurrently: deps.partitionsConsumedConcurrently,
    eachBatchAutoResolve: false,
    eachBatch: handler.eachBatch,
  });

  deps.kafkaLogger.info(
    {
      topic: deps.topic,
      partitionsConsumedConcurrently: deps.partitionsConsumedConcurrently,
    },
    'kafka events consumer running'
  );

  return {
    // kafkajs `stop()` is `sharedPromiseTo`, so `disconnect()`'s own internal
    // stop() below is the already-resolved promise rather than a second
    // teardown.
    stopConsuming: async () => {
      await consumer.stop();
    },
    stop: async () => {
      await consumer.disconnect();
    },
  };
}
