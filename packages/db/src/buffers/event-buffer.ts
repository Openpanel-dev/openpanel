import { getSafeJson } from '@openpanel/json';
import { getRedisCache, publishEvent } from '@openpanel/redis';
import { ch, chQuery } from '../clickhouse/client';
import type { IClickhouseEvent } from '../services/event.service';
import { BaseBuffer } from './base-buffer';

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
        'Failed to flush local buffer to Redis; events re-queued',
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
      this.batchSize - 1,
    );
    const lrangeMs = performance.now() - lrangeStart;

    if (queueEvents.length === 0) {
      this.reportFlushStats({ rowsProcessed: 0, phases: { lrangeMs } });
      return;
    }

    const eventsToClickhouse: IClickhouseEvent[] = [];
    for (const eventStr of queueEvents) {
      const event = getSafeJson<IClickhouseEvent>(eventStr);
      if (event) {
        if (!Array.isArray(event.groups)) {
          event.groups = [];
        }
        eventsToClickhouse.push(event);
      }
    }

    if (eventsToClickhouse.length === 0) {
      this.reportFlushStats({ rowsProcessed: 0, phases: { lrangeMs } });
      return;
    }

    eventsToClickhouse.sort(
      (a, b) =>
        new Date(a.created_at || 0).getTime() -
        new Date(b.created_at || 0).getTime(),
    );

    const chStart = performance.now();
    await this.parallelLimit(
      this.chunks(eventsToClickhouse, this.chunkSize),
      (chunk) =>
        ch.insert({
          table: 'events',
          values: chunk,
          format: 'JSONEachRow',
        }),
    );
    const chInsertMs = performance.now() - chStart;

    const countByProject = new Map<string, number>();
    for (const event of eventsToClickhouse) {
      countByProject.set(
        event.project_id,
        (countByProject.get(event.project_id) ?? 0) + 1,
      );
    }
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
