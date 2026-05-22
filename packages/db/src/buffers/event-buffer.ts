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

export class EventBuffer extends BaseBuffer {
  private batchSize = process.env.EVENT_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_BATCH_SIZE, 10)
    : 4000;
  private chunkSize = process.env.EVENT_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_CHUNK_SIZE, 10)
    : 1000;

  private microBatchIntervalMs = process.env.EVENT_BUFFER_MICRO_BATCH_MS
    ? Number.parseInt(process.env.EVENT_BUFFER_MICRO_BATCH_MS, 10)
    : 10;
  private microBatchMaxSize = process.env.EVENT_BUFFER_MICRO_BATCH_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_MICRO_BATCH_SIZE, 10)
    : 100;

  private pendingEvents: IClickhouseEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;
  /** Tracks consecutive flush failures for observability; reset on success. */
  private flushRetryCount = 0;

  private queueKey = 'event_buffer:queue';

  constructor() {
    super({
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
        countByProject.set(
          projectId,
          (countByProject.get(projectId) ?? 0) + 1,
        );
      }
      if ((i + 1) % yieldEvery === 0) {
        await this.yieldToEventLoop();
      }
    }

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
        }),
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
