// Delivery contract: per-key serial groups, the ascending contiguous-prefix
// offset walk, at-least-once, bounded in-consumer retry, and a dead-letter on
// exhaustion. The dead-letter destination is a capped Redis list, and the
// event is dropped whether or not that write lands.

import type {
  Consumer,
  EachBatchPayload,
  IHeaders,
  KafkaMessage,
} from 'kafkajs';
import type { IncomingEventPayload } from './incoming-event';

export interface KafkaConsumerHandle {
  /**
   * Stop fetching, then wait for the in-flight `eachBatch` to finish. Split out
   * from `stop` so a graceful shutdown has a point where nothing new can enter
   * the event buffer but the consumer has not been torn down yet — that is
   * where shutdown flushes whatever was buffered OUTSIDE a Kafka batch. Events
   * buffered inside one are already durable.
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
 * Ceiling on the wait a batch takes before it returns from a failed durability
 * flush and lets the broker redeliver it.
 *
 * The wait itself is seeded from `initialRetryMs` and doubled per consecutive
 * failure — the consumer's own retry convention — but it is capped HERE rather
 * than at `maxRetryMs`, which is sized for a flaky handler (1s by default) and
 * not for a dependency that is down. Without any cap a failed flush redelivers
 * in ~90ms and spins, hammering Redis and Kafka at the worst possible moment.
 * 5s keeps a ~15s outage to single-digit redeliveries and stays well below the
 * 30s session timeout, so waiting cannot cost the consumer its group
 * membership.
 */
const DURABILITY_RETRY_MAX_MS = 5000;

/** Why a message was dead-lettered. A label value — keep the set small. */
export type DeadLetterReason = 'parse_error' | 'handler_error';

/**
 * What the consumer hands to the dead-letter sink. The value stays the
 * producer's original bytes, so the record is a faithful copy of what arrived.
 *
 * Implemented by `@openpanel/redis`'s `createDeadLetterRecorder` (the capped
 * list) and `./kafka.ts`'s `produceDeadLetterEvent` (the DLQ topic; a message
 * produced from these bytes is replayable onto the events topic unchanged).
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
  handlerFailed: (partition: string) => void;
  /** The message was recorded in the dead-letter list and DROPPED. */
  deadLettered: (partition: string, reason: DeadLetterReason) => void;
  /**
   * The message was DROPPED WITHOUT being recorded — the dead-letter write
   * failed. Not "will be retried": nothing retries it.
   */
  deadLetterFailed: (partition: string) => void;
}

export interface EventsBatchHandlerDeps {
  handleEvent: (
    payload: IncomingEventPayload,
    meta: { partition: number; offset: string }
  ) => Promise<unknown>;
  /**
   * Park a poison message somewhere an operator can read it. It may reject —
   * the caller drops the message and resolves the offset regardless.
   */
  sendToDeadLetter: (message: DeadLetterMessage) => Promise<void>;
  /**
   * Opens a durability window over the event buffer and returns the gate that
   * closes it — `EventBuffer.openDurabilityWindow`.
   *
   * Opened BEFORE the batch's first handler runs, and awaited once every
   * message has been handled and BEFORE the first `resolveOffset`, because
   * kafkajs commits the resolved offsets as soon as `eachBatch` returns
   * (`autoCommit` defaults to true and this consumer does not turn it off) —
   * not at `consumer.stop`.
   *
   * The gate MUST reject when the events THIS batch buffered are not in
   * Redis: events that exist only in the event buffer's in-process array
   * would otherwise be lost with their committed offsets. The window is what
   * makes "this batch's events are durable" answerable, since a failed write
   * drops events instead of keeping them for the broker to redeliver.
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
  /**
   * Called on GROUP_JOIN: a new assignment may hand this member different
   * partitions, so the per-partition durability backoff below starts over.
   */
  resetDurabilityBackoff: () => void;
}

/**
 * The `eachBatch` handler, with its dependencies injected so the offset walk,
 * the per-key serial groups and the failure paths are testable without a
 * broker.
 *
 * Delivery contract: at-least-once. An offset is resolved only once its message
 * has been handled, dead-lettered, or deliberately skipped — never merely
 * because it failed. A dead-letter always counts as finished, because the
 * message is dropped either way; the one place an unresolved offset is still
 * correct is a failed DURABILITY flush, which leaves the whole batch for
 * redelivery.
 */
export function createEventsBatchHandler(
  deps: EventsBatchHandlerDeps
): EventsBatchHandler {
  const sleep = deps.sleep ?? defaultSleep;

  /**
   * Park the message and DROP it. The drop is unconditional: whether the record
   * was stored or not, this message's offset is resolved by the caller and the
   * event is gone from the pipeline.
   *
   * There is deliberately no retry, no backoff and no unresolved offset here.
   * The dead-letter destination is Redis, and Redis being unavailable is
   * exactly when handlers fail, so a failed write that held the offset back
   * would recreate the redelivery loop: once something else owns the outcome,
   * a safety net underneath it is the bug.
   * The two counters are what carry the volume, since a capped list makes
   * 50,000 drops look like 12: `deadLettered` = recorded and dropped,
   * `deadLetterFailed` = dropped WITHOUT being recorded. Neither means "will be
   * retried".
   */
  const deadLetter = async (
    message: KafkaMessage,
    partition: number,
    reason: DeadLetterReason,
    err: unknown
  ): Promise<void> => {
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
      deps.metrics.deadLetterFailed(label);
      // The WRITE failure goes in `err` — it is the news, and only that field
      // gets the logger's error serializer. What the message originally did
      // wrong rides along as text.
      deps.logger.error(
        {
          err: dlqErr,
          cause: errorMessage(err),
          partition,
          offset: message.offset,
          reason,
        },
        'kafka message DROPPED without being recorded — dead-letter write failed'
      );
      return;
    }
    deps.metrics.deadLettered(label, reason);
    deps.logger.error(
      { err, partition, offset: message.offset, reason },
      'kafka message dead-lettered — recorded and dropped'
    );
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

  /**
   * Always returns: the offset is resolvable either way. A message is handled,
   * or it is dead-lettered and dropped — there is no third outcome, which is
   * why the batch loop below has no unresolvable-message branch.
   */
  const processMessage = async (
    message: KafkaMessage,
    partition: number
  ): Promise<void> => {
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
      await deadLetter(message, partition, 'parse_error', err);
      return;
    }

    const result = await runHandlerWithRetry(
      payload,
      partition,
      message.offset
    );
    if (result.ok) {
      return;
    }
    await deadLetter(message, partition, 'handler_error', result.err);
  };

  // Consecutive durability failures per `topic-partition`, for the backoff
  // below. Cleared the moment a batch's events are durable again.
  const durabilityFailures = new Map<string, number>();

  /**
   * @returns false when the flush failed, which resolves no offset and leaves
   * the whole batch for the broker to redeliver.
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
    // Opened before the first handler buffers anything, so the gate answers for
    // THIS batch's events and not for whatever else was pending when it
    // finished.
    const closeDurabilityWindow = deps.openDurabilityWindow();

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

          // No "unresolvable" branch: a message is handled or dropped, and a
          // dropped one is still finished. The only gap this walk can now stop
          // at is the isRunning/isStale early return above, and the only
          // offsets left uncommitted are a whole batch whose durability flush
          // failed — see below.
          await processMessage(m, batch.partition);

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
      for (const m of batch.messages) {
        if (!processed.has(m.offset)) {
          break;
        }
        resolveOffset(m.offset);
      }
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
    resetDurabilityBackoff: () => {
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

  // Lifecycle / rebalance logging: a rebalance storm (a common source of
  // at-least-once duplicates) would otherwise be invisible.
  consumer.on(consumer.events.GROUP_JOIN, ({ payload }) => {
    // A new assignment means partitions may have moved between members, so a
    // consecutive-failure count carried over from the old one would pick the
    // wrong backoff for the new one.
    handler.resetDurabilityBackoff();
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
