// The graceful-shutdown sequence, lifted out of `main.ts` so its ORDER is a
// thing a test can assert rather than a property of how a `Promise.all` was
// typed.
//
// A SIGTERM restart once permanently lost accepted events (2 of 44,075)
// while a SIGKILL restart lost none. Graceful shutdown lost them BECAUSE
// it was graceful: the
// event buffer's in-process `pendingEvents` array was never flushed to Redis,
// and the offsets for those events had already been committed, so nothing was
// redelivered. A crash commits nothing, so Kafka replays the same window.
//
// The commit itself is NOT here: kafkajs auto-commits the offsets a batch
// resolved as soon as `eachBatch` returns, so the events a Kafka batch buffered
// are made durable inside the batch handler, before it resolves anything
// (`consumer.ts`'s `flushBufferedEvents`). What is left for this sequence is
// everything buffered OUTSIDE a Kafka batch — a session-end job's event, an
// import — which no offset covers and which a `process.exit` would simply drop.
//
// Either way it is one rpush of at most `microBatchMaxSize` events —
// milliseconds, well inside `SHUTDOWN_FORCE_EXIT_MS`. It is NOT a Redis ->
// ClickHouse drain: the Redis list is durable and the next process, or another
// replica, drains it.

/** Everything succeeded; the offsets are committed and the events are durable. */
export const SHUTDOWN_EXIT_OK = 0;
/**
 * Something failed. Exiting non-zero without committing is deliberately the
 * crash shape — the safe one: Kafka redelivers and a duplicate is
 * recoverable where a loss is not.
 */
export const SHUTDOWN_EXIT_FAILED = 1;

export interface ShutdownLogger {
  info: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
  fatal: (obj: object, msg?: string) => void;
}

/**
 * Each step is a no-op in the roles that do not have the thing it tears down,
 * so the sequence itself is unconditional and reads top to bottom.
 */
export interface ShutdownSteps {
  /** Stop serving HTTP. Readiness already answers 503 by this point. */
  stopHttpServer: () => Promise<void>;
  /** Let the cron queue finish what it started, if this process owns it. */
  drainCron: () => Promise<void>;
  /** BullMQ stops taking jobs and its in-flight handlers finish. */
  closeWorkers: () => Promise<void>;
  /** The Kafka consumer stops fetching and its in-flight batch finishes. */
  stopConsuming: () => Promise<void>;
  /** The one step that must not be concurrent with anything: rpush or throw. */
  flushEventBuffer: () => Promise<void>;
  /** The consumer leaves the group and disconnects. */
  stopConsumer: () => Promise<void>;
  closeProducers: () => Promise<void>;
  disconnectKafka: () => Promise<void>;
}

/**
 * @returns the process exit code. The caller owns `process.exit` and the
 * force-exit timer, so this function stays callable from a test.
 */
export async function runShutdownSequence(
  steps: ShutdownSteps,
  logger: ShutdownLogger
): Promise<number> {
  try {
    await steps.stopHttpServer();
    // Only if THIS process consumes cron: waiting on a queue another replica
    // owns would stall the whole shutdown budget on someone else's jobs.
    await steps.drainCron();
    // After this line nothing new can enter the event buffer: BullMQ has
    // stopped taking jobs and the Kafka consumer has stopped fetching, and
    // both have let their in-flight handlers finish. The two are unrelated
    // teardowns, so they still run concurrently — what changed is that the
    // consumer's DISCONNECT no longer runs here, alongside them.
    await Promise.all([steps.closeWorkers(), steps.stopConsuming()]);
  } catch (error) {
    logger.error({ err: error }, 'Error during graceful shutdown');
    return SHUTDOWN_EXIT_FAILED;
  }

  // Must COMPLETE before the consumer is torn down — never alongside it — and
  // must be able to stop the rest of the sequence: Redis being unreachable is
  // exactly when the rpush cannot land, and finishing a tidy shutdown then
  // would drop those events for good.
  try {
    await steps.flushEventBuffer();
  } catch (error) {
    logger.fatal(
      { err: error },
      'Event buffer flush to Redis failed — refusing to finish the shutdown so Kafka redelivers'
    );
    return SHUTDOWN_EXIT_FAILED;
  }

  try {
    await steps.stopConsumer();
    await steps.closeProducers();
    // Core opens the Kafka producer lazily on the first /track and the
    // consumer at boot; `deps.producers` is the BullMQ handle, not this one.
    // Without this an idempotent producer with in-flight batches is dropped.
    await steps.disconnectKafka();
  } catch (error) {
    logger.error({ err: error }, 'Error during graceful shutdown');
    return SHUTDOWN_EXIT_FAILED;
  }

  logger.info({}, 'Graceful shutdown completed');
  return SHUTDOWN_EXIT_OK;
}
