import { sql } from '@openpanel/db/src/clickhouse/sql';
import { getRedisCache, publishEvent } from '@openpanel/redis';
import type { IClickhouseEvent } from '../modules/event/event.service';
import { BaseBuffer, type BufferDeps } from './base-buffer';

const PROJECT_ID_NEEDLE = '"project_id":"';

/**
 * Extract the top-level `project_id` from a single JSONEachRow event
 * line without doing a full JSON.parse.
 *
 * Fast path: scan with `indexOf`. If the needle appears exactly once,
 * we know it's the top-level field (any `project_id` nested in a JSON
 * string value would be escaped as `\"project_id\":\"...`, which the
 * indexOf scan can't match because of the `\` in front).
 *
 * Slow path: if the needle appears two or more times, the line has a
 * legitimate nested `project_id` key (e.g. inside `properties` if a
 * user happens to set one with that name). The regex/indexOf can't
 * tell which is the top-level one — at that point we fall back to a
 * real JSON.parse for correctness. This is rare in practice but
 * removes the silent-attribution failure mode entirely.
 *
 * Returns `null` if no top-level project_id is present or the row is
 * malformed.
 */
export function extractProjectId(line: string): string | null {
  const first = line.indexOf(PROJECT_ID_NEEDLE);
  if (first < 0) {
    return null;
  }

  const second = line.indexOf(
    PROJECT_ID_NEEDLE,
    first + PROJECT_ID_NEEDLE.length
  );
  if (second >= 0) {
    try {
      const obj = JSON.parse(line) as { project_id?: unknown };
      return typeof obj.project_id === 'string' ? obj.project_id : null;
    } catch {
      return null;
    }
  }

  const valueStart = first + PROJECT_ID_NEEDLE.length;
  const valueEnd = line.indexOf('"', valueStart);
  // valueEnd === valueStart means the value is empty (`"project_id":""`)
  // — treat as missing so we don't pollute pub/sub counts with an empty
  // key. Matches the old regex's `[^"]+` (one-or-more) behavior.
  if (valueEnd <= valueStart) {
    return null;
  }
  return line.slice(valueStart, valueEnd);
}

const DEFAULT_BATCH_SIZE = 4000;
const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_MICRO_BATCH_MS = 10;
const DEFAULT_MICRO_BATCH_SIZE = 100;

export class EventBuffer extends BaseBuffer {
  private readonly batchSize =
    this.deps.config.buffers.event.batchSize ?? DEFAULT_BATCH_SIZE;
  private readonly chunkSize =
    this.deps.config.buffers.event.chunkSize ?? DEFAULT_CHUNK_SIZE;

  private readonly microBatchIntervalMs =
    this.deps.config.buffers.event.microBatchMs ?? DEFAULT_MICRO_BATCH_MS;
  private readonly microBatchMaxSize =
    this.deps.config.buffers.event.microBatchSize ?? DEFAULT_MICRO_BATCH_SIZE;

  private pendingEvents: IClickhouseEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * The durability watermark. Every event gets a monotonically increasing
   * sequence number in `add()`; `lastDurableSeq` is the highest sequence a
   * COMPLETED rpush covered. A caller's events are in Redis once
   * `lastDurableSeq` reaches the sequence of its last event — whoever wrote
   * them. That is the question the Kafka batch handler and shutdown need
   * answered ("are my events in Redis?"), and it is not the same question as
   * "did I start the write?" (M18-005, drill 03 re-run).
   */
  private lastQueuedSeq = 0;
  private lastDurableSeq = 0;

  /**
   * The rpush in flight and the highest sequence it will make durable. A write
   * always takes the whole pending array, so a caller whose target sequence is
   * at or below `coversSeq` is answered by this write and must not start
   * another.
   */
  private inFlightWrite: {
    coversSeq: number;
    done: Promise<unknown>;
  } | null = null;
  /** Tracks consecutive flush failures for observability; reset on success. */
  private flushRetryCount = 0;

  private queueKey = 'event_buffer:queue';

  constructor(deps: BufferDeps) {
    super(deps, {
      name: 'event',
      onFlush: async () => {
        await this.processBuffer();
      },
    });
  }

  bulkAdd(events: IClickhouseEvent[]) {
    for (const event of events) {
      this.add(event);
    }
  }

  add(event: IClickhouseEvent) {
    // Event-buffer's add() is synchronous (in-memory push). Measured anyway
    // for consistency with the other buffers' add-latency tracking.
    const start = performance.now();
    this.lastQueuedSeq += 1;
    this.pendingEvents.push(event);

    if (this.pendingEvents.length >= this.microBatchMaxSize) {
      this.flushLocalBuffer();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flushLocalBuffer();
      }, this.microBatchIntervalMs);
    }

    try {
      this.addObserver?.({
        buffer: this.name,
        durationMs: performance.now() - start,
      });
    } catch {
      // never break add on observer failure
    }
  }

  /** Number of events buffered locally in process memory, before Redis. */
  public getPendingLocalCount(): number {
    return this.pendingEvents.length;
  }

  public async flush() {
    try {
      await this.flushPendingOrThrow();
    } catch {
      // The fire-and-forget path swallows a Redis failure on purpose: the
      // events are re-queued and the micro-batch timer tries again, which is
      // the right answer while the process lives.
    }
  }

  /**
   * The same flush, but it THROWS when the rpush did not land, and it does not
   * resolve until every event accepted before the call is in Redis.
   *
   * `flush()` swallows a Redis failure on purpose. The two callers here have no
   * next attempt: the Kafka batch handler is about to resolve offsets that
   * kafkajs commits as soon as it returns, and shutdown is about to exit. Both
   * must be able to SEE the failure and decline to commit — a redelivered
   * duplicate is recoverable, a dropped `pendingEvents` array is not
   * (M18-001, drill 03).
   */
  public async flushPendingOrThrow(): Promise<void> {
    const target = this.lastQueuedSeq;

    // Not a retry loop: each pass either waits out a write that is already
    // running or starts the one write still missing, and a write covers
    // everything pending when it starts. So a concurrent write that happens to
    // carry our events resolves us — losing the race to start a write is a
    // SUCCESS, which is the whole correctness point (M18-005).
    while (this.lastDurableSeq < target) {
      const inFlight = this.inFlightWrite;

      if (inFlight === null) {
        if (this.pendingEvents.length === 0) {
          // Nothing pending and nothing in flight, so every sequence ever
          // queued has been written. Unreachable unless the watermark and the
          // array disagree; returning beats spinning.
          return;
        }
        this.throwIfFailed(await this.flushLocalBuffer());
        continue;
      }

      const failure = await inFlight.done;
      // A write that did not carry our events is not our failure: its events
      // are re-queued at the front and the write we start next takes them too.
      if (inFlight.coversSeq >= target) {
        this.throwIfFailed(failure);
      }
    }
  }

  private throwIfFailed(failure: unknown): void {
    if (failure === null) {
      return;
    }
    throw failure instanceof Error ? failure : new Error(String(failure));
  }

  /**
   * Starts a write unless one is already running, and returns the write that
   * makes everything currently pending durable.
   *
   * Never rejects — `add()` calls it without awaiting. The failure comes back
   * as the resolved value instead, for the callers that must act on it.
   */
  private flushLocalBuffer(): Promise<unknown> {
    if (this.inFlightWrite) {
      return this.inFlightWrite.done;
    }
    if (this.pendingEvents.length === 0) {
      return Promise.resolve(null);
    }

    // The write takes everything the timer would have taken.
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const eventsToFlush = this.pendingEvents;
    this.pendingEvents = [];
    // The whole pending array goes in one write, and `add()` assigns sequences
    // in order, so this write covers every sequence assigned so far.
    const coversSeq = this.lastQueuedSeq;

    const done = this.writeToRedis(eventsToFlush, coversSeq).then((failure) => {
      this.inFlightWrite = null;
      this.scheduleFlushIfPending();
      return failure;
    });
    this.inFlightWrite = { coversSeq, done };
    return done;
  }

  /** @returns the failure the rpush ended with, or `null` on success. */
  private async writeToRedis(
    eventsToFlush: IClickhouseEvent[],
    coversSeq: number
  ): Promise<unknown> {
    try {
      const redis = getRedisCache();
      const multi = redis.multi();

      for (const event of eventsToFlush) {
        multi.rpush(this.queueKey, JSON.stringify(event));
      }

      const results = await multi.exec();
      // ioredis RESOLVES a MULTI whose individual commands failed, handing the
      // error back per entry — so a WRONGTYPE or an out-of-memory rpush would
      // otherwise read as a successful flush and the events would be dropped
      // silently. The batch handler decides whether to resolve Kafka offsets
      // on this answer, so it has to be the truth (M18-001).
      if (results === null) {
        throw new Error('event buffer rpush transaction was aborted');
      }
      const rejected = results.find(([commandError]) => commandError !== null);
      if (rejected?.[0]) {
        throw rejected[0];
      }

      // The durability boundary: past this point the events survive any
      // process death, so everyone waiting on a sequence in this write is done.
      this.lastDurableSeq = Math.max(this.lastDurableSeq, coversSeq);
      this.flushRetryCount = 0;
      return null;
    } catch (error) {
      // Re-queue failed events at the front to preserve order and avoid data loss
      this.pendingEvents = eventsToFlush.concat(this.pendingEvents);

      this.flushRetryCount += 1;
      this.logger.warn(
        {
          err: error,
          eventCount: eventsToFlush.length,
          flushRetryCount: this.flushRetryCount,
        },
        'Failed to flush local buffer to Redis; events re-queued'
      );
      return error;
    }
  }

  /** Events may arrive while a write is running; they get the next micro-batch. */
  private scheduleFlushIfPending(): void {
    if (this.pendingEvents.length === 0 || this.flushTimer) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushLocalBuffer();
    }, this.microBatchIntervalMs);
  }

  protected getRedisListKey(): string {
    return this.queueKey;
  }

  async processBuffer() {
    const redis = getRedisCache();

    const lrangeStart = performance.now();
    const queueEvents = await redis.lrange(
      this.queueKey,
      0,
      this.batchSize - 1
    );
    const lrangeMs = performance.now() - lrangeStart;

    if (queueEvents.length === 0) {
      this.reportFlushStats({ rowsProcessed: 0, phases: { lrangeMs } });
      return;
    }

    // We don't need to JSON.parse the events at all — they're already
    // valid JSONEachRow lines (one stringified event per Redis entry).
    // The client's custom `json.stringify` (set in CLICKHOUSE_OPTIONS)
    // passes strings through unchanged, so the bytes go straight from
    // Redis → CH HTTP body. This skips:
    //   - JSON.parse × N (50–300ms for N=100k)
    //   - The @clickhouse/client's internal JSON.stringify × N (same)
    //   - All the intermediate object allocations (saves ~200MB heap)
    //
    // We still need `project_id` per row for the per-project pub/sub.
    // extractProjectId() does an indexOf-based fast path that's ~50×
    // faster than JSON.parse, and falls back to a real parse on the
    // rare line where `project_id` appears more than once (e.g. a
    // user-supplied `properties.project_id`) — so the count is always
    // attributed to the top-level field, never a nested one.
    const countByProject = new Map<string, number>();
    const yieldEvery = this.getYieldInterval(queueEvents.length, {
      min: 1000,
      max: 5000,
    });
    for (let i = 0; i < queueEvents.length; i++) {
      const projectId = extractProjectId(queueEvents[i]!);
      if (projectId) {
        countByProject.set(projectId, (countByProject.get(projectId) ?? 0) + 1);
      }
      if ((i + 1) % yieldEvery === 0) {
        await this.yieldToEventLoop();
      }
    }

    const ch = this.resolveCh();
    const chStart = performance.now();
    await this.parallelLimit(
      this.chunks(queueEvents, this.chunkSize),
      (chunk) =>
        ch.insert({
          table: 'events',
          // Stream the raw JSONEachRow lines straight through — already
          // serialized in Redis, no client-side parse/stringify needed.
          values: this.jsonEachRowStream(chunk),
          format: 'JSONEachRow',
          clickhouse_settings: this.getClickhouseSettings(),
        })
    );
    const chInsertMs = performance.now() - chStart;

    for (const [projectId, count] of countByProject) {
      publishEvent('events', 'batch', { projectId, count });
    }

    const trimStart = performance.now();
    await redis.ltrim(this.queueKey, queueEvents.length, -1);
    const trimMs = performance.now() - trimStart;

    this.reportFlushStats({
      rowsProcessed: queueEvents.length,
      phases: { lrangeMs, chInsertMs, trimMs },
    });
  }

  public async getActiveVisitorCount(projectId: string): Promise<number> {
    const rows = await this.chQuery<{ count: number }>(sql`
      SELECT uniq(profile_id) AS count
      FROM events
      WHERE project_id = ${sql.string(projectId)}
        AND profile_id != ''
        AND created_at >= now() - INTERVAL 5 MINUTE
    `);
    return rows[0]?.count ?? 0;
  }
}
