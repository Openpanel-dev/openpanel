import {
  createKafkaEventsConsumer,
  type DeadLetterMessage,
  type EachBatchPayload,
  type EventsQueuePayloadIncomingEvent,
  KAFKA_EVENTS_TOPIC,
  KAFKA_HANDLER_MAX_ATTEMPTS,
  KAFKA_HANDLER_RETRY_INITIAL_MS,
  KAFKA_HANDLER_RETRY_MAX_MS,
  KAFKA_PARTITIONS_CONCURRENT,
  type KafkaMessage,
  kafkaLogger,
  produceDeadLetterEvent,
} from '@openpanel/queue';
import {
  kafkaDeadLetteredTotal,
  kafkaDeadLetterFailedTotal,
  kafkaHandlerFailuresTotal,
  kafkaReprocessedTotal,
} from '../metrics';
import { logger } from '../utils/logger';
import { markEventsActivity } from '../utils/worker-heartbeat';
import { incomingEvent } from './events.incoming-event';

export interface KafkaConsumerHandle {
  stop: () => Promise<void>;
}

// Heartbeat every N messages within a per-key group. The default kafkajs
// sessionTimeout is 30s — calling heartbeat every 16 messages keeps us
// comfortably under that even for slow handlers.
const HEARTBEAT_EVERY = 16;

const RETRY_BACKOFF_FACTOR = 2;

/** Why a message was dead-lettered. A label value — keep the set small. */
type DeadLetterReason = 'parse_error' | 'handler_error';

interface ConsumerLogger {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

interface ConsumerMetrics {
  reprocessed: (partition: string) => void;
  handlerFailed: (partition: string) => void;
  deadLettered: (partition: string, reason: DeadLetterReason) => void;
  deadLetterFailed: (partition: string) => void;
}

export interface EventsBatchHandlerDeps {
  handleEvent: (
    payload: EventsQueuePayloadIncomingEvent['payload'],
    meta: { partition: number; offset: string }
  ) => Promise<unknown>;
  sendToDeadLetter: (message: DeadLetterMessage) => Promise<void>;
  logger: ConsumerLogger;
  metrics: ConsumerMetrics;
  onActivity: () => void;
  topic: string;
  maxAttempts: number;
  initialRetryMs: number;
  maxRetryMs: number;
  sleep: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const defaultDeps = (): EventsBatchHandlerDeps => ({
  handleEvent: incomingEvent,
  sendToDeadLetter: produceDeadLetterEvent,
  logger,
  metrics: {
    reprocessed: (partition) => kafkaReprocessedTotal.inc({ partition }),
    handlerFailed: (partition) => kafkaHandlerFailuresTotal.inc({ partition }),
    deadLettered: (partition, reason) =>
      kafkaDeadLetteredTotal.inc({ partition, reason }),
    deadLetterFailed: (partition) =>
      kafkaDeadLetterFailedTotal.inc({ partition }),
  },
  onActivity: markEventsActivity,
  topic: KAFKA_EVENTS_TOPIC,
  maxAttempts: KAFKA_HANDLER_MAX_ATTEMPTS,
  initialRetryMs: KAFKA_HANDLER_RETRY_INITIAL_MS,
  maxRetryMs: KAFKA_HANDLER_RETRY_MAX_MS,
  sleep: defaultSleep,
});

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
  overrides: Partial<EventsBatchHandlerDeps> = {}
): EventsBatchHandler {
  const deps: EventsBatchHandlerDeps = { ...defaultDeps(), ...overrides };

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
    payload: EventsQueuePayloadIncomingEvent['payload'],
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
          await deps.sleep(delayMs);
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
    let payload: EventsQueuePayloadIncomingEvent['payload'];
    try {
      if (!message.value) {
        throw new Error('kafka message has no value');
      }
      payload = JSON.parse(
        message.value.toString()
      ) as EventsQueuePayloadIncomingEvent['payload'];
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

    await heartbeat();
    deps.onActivity();
  };

  return { eachBatch, resetWatermarks: () => resolvedHWM.clear() };
}

export async function startKafkaEventsConsumer(): Promise<KafkaConsumerHandle> {
  const consumer = createKafkaEventsConsumer();
  const handler = createEventsBatchHandler();
  await consumer.connect();
  await consumer.subscribe({
    topic: KAFKA_EVENTS_TOPIC,
    fromBeginning: false,
  });

  consumer.on(consumer.events.HEARTBEAT, markEventsActivity);

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
    logger.warn('kafka consumer disconnected');
  });
  consumer.on(consumer.events.REQUEST_TIMEOUT, ({ payload }) => {
    logger.warn(
      { broker: payload.broker, clientId: payload.clientId },
      'kafka consumer request timeout'
    );
  });

  await consumer.run({
    partitionsConsumedConcurrently: KAFKA_PARTITIONS_CONCURRENT,
    eachBatchAutoResolve: false,
    eachBatch: handler.eachBatch,
  });

  kafkaLogger.info(
    {
      topic: KAFKA_EVENTS_TOPIC,
      partitionsConsumedConcurrently: KAFKA_PARTITIONS_CONCURRENT,
    },
    'kafka events consumer running'
  );

  return {
    stop: async () => {
      await consumer.disconnect();
    },
  };
}
