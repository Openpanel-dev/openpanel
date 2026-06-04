import { getRedisCache, publishEvent } from '@openpanel/redis';
import { ch, chQuery } from '../clickhouse/client';
import type { IClickhouseEvent } from '../services/event.service';
import { BaseBuffer } from './base-buffer';

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
  if (first < 0) return null;

  const second = line.indexOf(PROJECT_ID_NEEDLE, first + PROJECT_ID_NEEDLE.length);
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
  if (valueEnd <= valueStart) return null;
  return line.slice(valueStart, valueEnd);
}

/**
 * Shard count for the event Redis queue.
 *
 * Default 1 = legacy single-key behavior (`event_buffer:queue`), bit-
 * identical to pre-shard deployments.
 * Set EVENT_BUFFER_SHARDS=8 (or 16) to split the queue into N shards,
 * each with its own `event_buffer:queue:{i}` list and its own
 * `lock:event:{i}` flush lock. This breaks the single-lock bottleneck:
 * with N shards, up to N parallel CH-insert pipelines can run at once.
 *
 * Backward compatibility: the legacy single-key buffer is ALWAYS
 * instantiated alongside the sharded buffers. After deployment, any
 * events that were already in `event_buffer:queue` get drained by the
 * legacy buffer until empty; new events route to sharded buffers via
 * stable hashing on device_id. No data loss or stalled-key state.
 */
export const EVENT_BUFFER_SHARDS = process.env.EVENT_BUFFER_SHARDS
  ? Math.max(1, Number.parseInt(process.env.EVENT_BUFFER_SHARDS, 10))
  : 1;

/**
 * Stable per-event hash to a shard index. Uses device_id as the
 * primary key (events from the same device land on the same shard,
 * which keeps CH-side per-device aggregations natural), with
 * session_id / event id as fallbacks for events that lack a device.
 */
export function hashEventToShard(event: IClickhouseEvent): number {
  if (EVENT_BUFFER_SHARDS === 1) return 0;
  const key = event.device_id || event.session_id || event.id || '';
  // djb2-ish 32-bit hash; cheap and well-distributed for short strings
  let hash = 5381 | 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % EVENT_BUFFER_SHARDS;
}

/**
 * The Redis LIST key for a given shard. `null` => legacy single key
 * (backward-compatible with pre-shard deployments).
 */
function queueKeyForShard(shardId: number | null): string {
  return shardId === null ? 'event_buffer:queue' : `event_buffer:queue:${shardId}`;
}

/**
 * A nice-readable buffer name for logs / metrics / lock keys.
 */
function bufferNameForShard(shardId: number | null): string {
  return shardId === null ? 'event' : `event:${shardId}`;
}

export class EventBuffer extends BaseBuffer {
  // Defaults tuned upwards. With the atomic LPOP + per-chunk failure
  // handling + lock heartbeat below, the previous 4000/1000 pair was a
  // safety hedge against the old LRANGE+LTRIM races. Each tick can now
  // safely handle a larger batch without risking a queue stall on partial
  // failure.
  private batchSize = process.env.EVENT_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_BATCH_SIZE, 10)
    : 8000;
  private chunkSize = process.env.EVENT_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_CHUNK_SIZE, 10)
    : 2000;

  private microBatchIntervalMs = process.env.EVENT_BUFFER_MICRO_BATCH_MS
    ? Number.parseInt(process.env.EVENT_BUFFER_MICRO_BATCH_MS, 10)
    : 10;
  private microBatchMaxSize = process.env.EVENT_BUFFER_MICRO_BATCH_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_MICRO_BATCH_SIZE, 10)
    : 200;

  private pendingEvents: IClickhouseEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;
  /** Tracks consecutive flush failures for observability; reset on success. */
  private flushRetryCount = 0;

  /** Shard ID (null = legacy single key). */
  private shardId: number | null;
  private queueKey: string;

  constructor(shardId: number | null = null) {
    super({
      name: bufferNameForShard(shardId),
      onFlush: async () => {
        await this.processBuffer();
      },
    });
    this.shardId = shardId;
    this.queueKey = queueKeyForShard(shardId);
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
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flushLocalBuffer();
  }

  private async flushLocalBuffer() {
    if (this.isFlushing || this.pendingEvents.length === 0) {
      return;
    }

    this.isFlushing = true;

    const eventsToFlush = this.pendingEvents;
    this.pendingEvents = [];

    try {
      const redis = getRedisCache();
      const multi = redis.multi();

      for (const event of eventsToFlush) {
        multi.rpush(this.queueKey, JSON.stringify(event));
      }

      await multi.exec();

      this.flushRetryCount = 0;
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
    } finally {
      this.isFlushing = false;
      // Events may have accumulated while we were flushing; schedule another flush if needed
      if (this.pendingEvents.length > 0 && !this.flushTimer) {
        this.flushTimer = setTimeout(() => {
          this.flushTimer = null;
          this.flushLocalBuffer();
        }, this.microBatchIntervalMs);
      }
    }
  }

  protected getRedisListKey(): string {
    return this.queueKey;
  }

  /**
   * Atomic batch consume + per-chunk independent failure handling.
   *
   * The previous design (LRANGE + LTRIM bracketing the CH inserts) had two
   * unsafe interleavings under load:
   *
   *   1. Partial chunk failure → throw → LTRIM never runs → next flush
   *      re-INSERTs every event the previous flush already wrote, so CH
   *      grows duplicate rows on every retry.
   *   2. Lock expiry mid-flush (60s TTL, slow CH) → another worker enters
   *      processBuffer, reads the same events with LRANGE, and races on
   *      the same LTRIM — same effect.
   *
   * Both failure modes silently bloat `event_buffer:queue` past the
   * Redis maxmemory cap. We've hit this in production three times.
   *
   * The new design:
   *
   *   - LPOP with COUNT atomically removes the head of the queue in a
   *     single round-trip. There is no LRANGE / LTRIM window any more.
   *   - Each chunk's CH insert runs under Promise.allSettled, so one
   *     chunk's 30s timeout cannot poison the work of the other 4. We
   *     LPUSH only the failed chunks back at the head — preserving
   *     ordering within the failed events and giving them another
   *     attempt on the next cron tick.
   *   - Any unexpected error during processing re-queues the entire
   *     batch in the `finally` block, so a bug in our own code can never
   *     cause silent event loss.
   */
  async processBuffer() {
    const redis = getRedisCache();

    const popStart = performance.now();
    // ioredis LPOP with COUNT returns string[] | null
    const popped = (await redis.lpop(this.queueKey, this.batchSize)) as
      | string[]
      | null;
    const popMs = performance.now() - popStart;

    if (!popped || popped.length === 0) {
      this.reportFlushStats({ rowsProcessed: 0, phases: { lrangeMs: popMs } });
      return;
    }

    // Events held in-flight by this worker. Re-queued in the finally
    // block if anything throws unexpectedly. Mutated as we partition
    // successful vs failed chunks below.
    let inFlight: string[] = popped;

    try {
      // Per-project counts (best-effort; published only on full success
      // so dashboards don't see inflated numbers for partially-failed
      // batches that will be retried).
      const countByProject = new Map<string, number>();
      const yieldEvery = this.getYieldInterval(popped.length, {
        min: 1000,
        max: 5000,
      });
      for (let i = 0; i < popped.length; i++) {
        const projectId = extractProjectId(popped[i]!);
        if (projectId) {
          countByProject.set(
            projectId,
            (countByProject.get(projectId) ?? 0) + 1
          );
        }
        if ((i + 1) % yieldEvery === 0) {
          await this.yieldToEventLoop();
        }
      }

      // Per-chunk parallel insert with independent failure tracking.
      // Promise.allSettled returns every chunk's result so a single
      // CH timeout cannot abort the other inserts mid-way.
      const chStart = performance.now();
      const chunks = this.chunks(popped, this.chunkSize);
      const results = await Promise.allSettled(
        chunks.map((chunk) =>
          ch.insert({
            table: 'events',
            // Stream the raw JSONEachRow lines straight through — already
            // serialized in Redis, no client-side parse/stringify needed.
            values: this.jsonEachRowStream(chunk),
            format: 'JSONEachRow',
            clickhouse_settings: this.getClickhouseSettings(),
          })
        )
      );
      const chInsertMs = performance.now() - chStart;

      // Partition chunks by result.
      const failedChunks: string[][] = [];
      let firstError: unknown = null;
      for (let i = 0; i < results.length; i++) {
        const r = results[i]!;
        if (r.status === 'rejected') {
          failedChunks.push(chunks[i]!);
          if (firstError === null) firstError = r.reason;
        }
      }
      const failedEvents = failedChunks.flat();

      // From here on, only the failed events are "in flight" — the
      // succeeded ones are committed to CH and must not be re-queued.
      inFlight = failedEvents;

      if (failedEvents.length > 0) {
        this.logger.warn(
          {
            failedChunkCount: failedChunks.length,
            failedEventCount: failedEvents.length,
            successCount: popped.length - failedEvents.length,
            firstError,
          },
          'Partial CH insert failure; failed chunks re-queued at head'
        );
      }

      // Publish per-project counts for events that actually landed in CH.
      // On the happy path, all `popped` events were inserted; emit the
      // counts we built up-front. On partial failure, the failed events
      // will be counted on their next (successful) flush, but the
      // successful chunks ARE already in CH right now — so we subtract
      // the failed counts from the total to give realtime consumers an
      // accurate per-project signal for the rows that just landed.
      if (failedEvents.length === 0) {
        for (const [projectId, count] of countByProject) {
          publishEvent('events', 'batch', { projectId, count });
        }
      } else {
        const failedCountByProject = new Map<string, number>();
        for (const eventLine of failedEvents) {
          const projectId = extractProjectId(eventLine);
          if (projectId) {
            failedCountByProject.set(
              projectId,
              (failedCountByProject.get(projectId) ?? 0) + 1
            );
          }
        }
        for (const [projectId, totalCount] of countByProject) {
          const failedCount = failedCountByProject.get(projectId) ?? 0;
          const successCount = totalCount - failedCount;
          if (successCount > 0) {
            publishEvent('events', 'batch', {
              projectId,
              count: successCount,
            });
          }
        }
      }

      this.reportFlushStats({
        rowsProcessed: popped.length - failedEvents.length,
        phases: { lrangeMs: popMs, chInsertMs },
      });
    } finally {
      // ALWAYS re-queue events still in flight (failed chunks OR an
      // unexpected mid-flush throw). LPUSH with multiple values inserts
      // them in reverse order, so we reverse the array to preserve the
      // original queue order at the head.
      if (inFlight.length > 0) {
        try {
          await redis.lpush(this.queueKey, ...inFlight.slice().reverse());
        } catch (requeueErr) {
          // If even the re-queue fails, log loudly — events are LOST.
          // This shouldn't happen with a healthy Redis connection;
          // surfacing it makes investigation possible.
          this.logger.error(
            {
              err: requeueErr,
              lostEventCount: inFlight.length,
              shardId: this.shardId,
            },
            'CRITICAL: failed to re-queue events to Redis — events LOST'
          );
        }
      }
    }
  }

  public async getActiveVisitorCount(projectId: string): Promise<number> {
    const rows = await chQuery<{ count: number }>(
      `SELECT uniq(profile_id) AS count
       FROM events
       WHERE project_id = '${projectId}'
         AND profile_id != ''
         AND created_at >= now() - INTERVAL 5 MINUTE`
    );
    return rows[0]?.count ?? 0;
  }
}
