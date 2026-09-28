/**
 * The ingest consumer's dead-letter destination: a capped Redis list.
 *
 * Carl, 2026-09-14: *"For now, we can just store errors in redis and drop the
 * event, push it to a redis list and only keep the last N events."*
 *
 * It replaces `produceDeadLetterEvent`, which produced to
 * `${KAFKA_EVENTS_TOPIC}-dlq` — a topic nothing in the tree ever creates. Drill
 * 08 measured that produce failing 1,592 times with 0 successes (`Number of
 * partitions is invalid`), and the failure left the offset unresolved, which is
 * the unbounded handler-error redelivery loop drill 02's re-run 2 measured at
 * 78-79 laps per message. The Kafka producer is still exported from
 * `@openpanel/core`, and the consumer's `sendToDeadLetter` seam is unchanged,
 * so swapping back is one line in `apps/api`'s wiring.
 *
 * THE RECORD IS A DEBUGGING SAMPLE, NOT A RECOVERY MECHANISM. The list keeps
 * the last N and nothing more; the event itself is gone from the pipeline. The
 * volume lives in `kafka_events_dead_lettered_total` /
 * `_dead_letter_failed_total`, because a capped list makes 50,000 drops look
 * exactly like 12.
 *
 * Why here and not in `packages/core`'s ingest module: the whole of it is Redis
 * mechanics — one MULTI, one LPUSH, one LTRIM — and core's only export door is
 * its barrel, which M20-001's scope does not cover. The input type is
 * structural, so `DeadLetterMessage` (kafkajs `Buffer`s and `IHeaders`)
 * satisfies it without this package depending on kafkajs or on core.
 */

/** The one list. Not configurable: an operator has to be able to find it. */
export const DEAD_LETTER_LIST_KEY = 'dead_letter:events';

/** A `Buffer`, or anything else the caller hands us as raw message bytes. */
interface BinaryLike {
  toString(): string;
}

/**
 * Structurally what `@openpanel/core`'s `DeadLetterMessage` is — the same
 * fields `produceDeadLetterEvent` put in its DLQ headers, so a record carries
 * everything needed to find the message on the source topic.
 */
export interface DeadLetterInput {
  key: BinaryLike | null;
  value: BinaryLike | null;
  headers?: Record<string, unknown> | undefined;
  topic: string;
  partition: number;
  offset: string;
  reason: string;
  error: string;
}

/** One entry of the list, as stored (JSON). */
export interface DeadLetterRecord {
  recordedAt: string;
  topic: string;
  partition: number;
  offset: string;
  reason: string;
  error: string;
  key: string | null;
  /** The producer's original payload, as text — events on this topic are JSON. */
  value: string | null;
  headers: Record<string, string>;
}

/**
 * The narrow slice of a Redis client this needs. Structural rather than
 * ioredis's `Redis`, so the contract is one MULTI and a test can satisfy it
 * without a server.
 */
export interface DeadLetterMulti {
  lpush(key: string, value: string): DeadLetterMulti;
  ltrim(key: string, start: number, stop: number): DeadLetterMulti;
  exec(): Promise<[Error | null, unknown][] | null>;
}

export interface DeadLetterRedisClient {
  multi(): DeadLetterMulti;
}

export interface DeadLetterRecorderOptions {
  client: DeadLetterRedisClient;
  /** How many records the list keeps. The oldest fall off the tail. */
  maxEntries: number;
  /** Overridable for tests; production uses the constant above. */
  key?: string;
}

const toText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toText).join(',');
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
};

const normalizeHeaders = (
  headers: Record<string, unknown> | undefined
): Record<string, string> => {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    normalized[name] = toText(value);
  }
  return normalized;
};

export const toDeadLetterRecord = (
  input: DeadLetterInput,
  recordedAt: Date = new Date()
): DeadLetterRecord => ({
  recordedAt: recordedAt.toISOString(),
  topic: input.topic,
  partition: input.partition,
  offset: input.offset,
  reason: input.reason,
  error: input.error,
  key: input.key === null ? null : input.key.toString(),
  value: input.value === null ? null : input.value.toString(),
  headers: normalizeHeaders(input.headers),
});

/**
 * ONE round trip per dropped event: LPUSH and LTRIM travel in a single MULTI,
 * so the list is never observed above `maxEntries` and a dropped event never
 * costs the ingest path two waits.
 *
 * It REJECTS when the write did not land — including a per-command error such
 * as `WRONGTYPE`, which a MULTI reports inside `exec()`'s results rather than
 * by rejecting. The caller counts that as "dropped without being recorded" and
 * resolves the offset anyway: Redis being unavailable is exactly when handlers
 * fail, and an unresolved offset there is the redelivery loop this replaces.
 */
export function createDeadLetterRecorder(
  options: DeadLetterRecorderOptions
): (input: DeadLetterInput) => Promise<void> {
  const key = options.key ?? DEAD_LETTER_LIST_KEY;
  const lastIndexKept = options.maxEntries - 1;

  return async (input: DeadLetterInput): Promise<void> => {
    const results = await options.client
      .multi()
      .lpush(key, JSON.stringify(toDeadLetterRecord(input)))
      .ltrim(key, 0, lastIndexKept)
      .exec();

    if (results === null) {
      throw new Error(`dead-letter MULTI on ${key} was discarded by Redis`);
    }
    for (const [error] of results) {
      if (error) {
        throw error;
      }
    }
  };
}
