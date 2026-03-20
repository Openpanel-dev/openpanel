import { getSafeJson } from '@openpanel/json';
import { getRedisCache, publishEvent, type Redis } from '@openpanel/redis';
import { ch } from '../clickhouse/client';
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

  private activeVisitorsExpiration = 60 * 5; // 5 minutes
  /** How often (ms) we refresh the heartbeat key + zadd per visitor. */
  private heartbeatRefreshMs = 60_000; // 1 minute
  private lastHeartbeat = new Map<string, number>();
  private queueKey = 'event_buffer:queue';
  protected bufferCounterKey = 'event_buffer:total_count';

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
    this.pendingEvents.push(event);

    if (this.pendingEvents.length >= this.microBatchMaxSize) {
      this.flushLocalBuffer();
      return;
    }

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flushLocalBuffer();
      }, this.microBatchIntervalMs);
    }
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
        if (event.profile_id) {
          this.incrementActiveVisitorCount(
            multi,
            event.project_id,
            event.profile_id
          );
        }
      }
      multi.incrby(this.bufferCounterKey, eventsToFlush.length);

      await multi.exec();

      this.flushRetryCount = 0;
      this.pruneHeartbeatMap();
    } catch (error) {
      // Re-queue failed events at the front to preserve order and avoid data loss
      this.pendingEvents = eventsToFlush.concat(this.pendingEvents);

      this.flushRetryCount += 1;
      this.logger.warn(
        'Failed to flush local buffer to Redis; events re-queued',
        {
          error,
          eventCount: eventsToFlush.length,
          flushRetryCount: this.flushRetryCount,
        }
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

  async processBuffer() {
    const redis = getRedisCache();

    try {
      const queueEvents = await redis.lrange(
        this.queueKey,
        0,
        this.batchSize - 1
      );

      if (queueEvents.length === 0) {
        this.logger.debug('No events to process');
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
        this.logger.debug('No valid events to process');
        return;
      }

      eventsToClickhouse.sort(
        (a, b) =>
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime()
      );

      this.logger.info('Inserting events into ClickHouse', {
        totalEvents: eventsToClickhouse.length,
        chunks: Math.ceil(eventsToClickhouse.length / this.chunkSize),
      });

      for (const chunk of this.chunks(eventsToClickhouse, this.chunkSize)) {
        await ch.insert({
          table: 'events',
          values: chunk,
          format: 'JSONEachRow',
        });
      }

      const countByProject = new Map<string, number>();
      for (const event of eventsToClickhouse) {
        countByProject.set(
          event.project_id,
          (countByProject.get(event.project_id) ?? 0) + 1
        );
      }
      for (const [projectId, count] of countByProject) {
        publishEvent('events', 'batch', { projectId, count });
      }

      await redis
        .multi()
        .ltrim(this.queueKey, queueEvents.length, -1)
        .decrby(this.bufferCounterKey, queueEvents.length)
        .exec();

      this.logger.info('Processed events from Redis buffer', {
        batchSize: this.batchSize,
        eventsProcessed: eventsToClickhouse.length,
      });
    } catch (error) {
      this.logger.error('Error processing Redis buffer', { error });
    }
  }

  public async getBufferSize() {
    return this.getBufferSizeWithCounter(async () => {
      const redis = getRedisCache();
      return await redis.llen(this.queueKey);
    });
  }

  private pruneHeartbeatMap() {
    const cutoff = Date.now() - this.activeVisitorsExpiration * 1000;
    for (const [key, ts] of this.lastHeartbeat) {
      if (ts < cutoff) {
        this.lastHeartbeat.delete(key);
      }
    }
  }

  private incrementActiveVisitorCount(
    multi: ReturnType<Redis['multi']>,
    projectId: string,
    profileId: string
  ) {
    const key = `${projectId}:${profileId}`;
    const now = Date.now();
    const last = this.lastHeartbeat.get(key) ?? 0;

    if (now - last < this.heartbeatRefreshMs) {
      return;
    }

    this.lastHeartbeat.set(key, now);
    const zsetKey = `live:visitors:${projectId}`;
    const heartbeatKey = `live:visitor:${projectId}:${profileId}`;
    multi
      .zadd(zsetKey, now, profileId)
      .set(heartbeatKey, '1', 'EX', this.activeVisitorsExpiration);
  }

  public async getActiveVisitorCount(projectId: string): Promise<number> {
    const redis = getRedisCache();
    const zsetKey = `live:visitors:${projectId}`;
    const cutoff = Date.now() - this.activeVisitorsExpiration * 1000;

    const multi = redis.multi();
    multi
      .zremrangebyscore(zsetKey, '-inf', cutoff)
      .zcount(zsetKey, cutoff, '+inf');

    const [, count] = (await multi.exec()) as [
      [Error | null, any],
      [Error | null, number],
    ];

    return count[1] || 0;
  }
}
