import { Readable } from 'node:stream';
import { getSafeJson } from '@openpanel/json';
import {
  type Redis,
  getRedisCache,
  getRedisPub,
  publishEvent,
} from '@openpanel/redis';
import { ch } from '../clickhouse/client';
import {
  type IClickhouseEvent,
  type IServiceEvent,
  transformEvent,
} from '../services/event.service';
import { BaseBuffer } from './base-buffer';

export class EventBuffer extends BaseBuffer {
  private batchSize = process.env.EVENT_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_BATCH_SIZE, 10)
    : 4000;
  private chunkSize = process.env.EVENT_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_CHUNK_SIZE, 10)
    : 1000;

  private activeVisitorsExpiration = 60 * 5; // 5 minutes
  private lastScreenViewTTL = 60 * 60; // 1 hour

  private readonly redisKey = 'event-buffer';
  private readonly retryKey = 'event-buffer:retry';
  private readonly dlqKey = 'event-buffer:dlq'; // Dead Letter Queue
  private readonly retryCounterKey = 'event:retry:count';
  private readonly dlqCounterKey = 'event:dlq:count';
  private readonly maxRetries = 3;
  private redis: Redis;

  constructor() {
    super({
      name: 'event',
      onFlush: async () => {
        await this.processBuffer();
      },
      // Enable parallel processing for better scalability with multiple workers
      enableParallelProcessing: process.env.EVENT_BUFFER_PARALLEL === 'true',
    });
    this.redis = getRedisCache();
  }

  /**
   * Convert event to CSV row format with headers
   * Order must match the ClickHouse table schema
   */
  private eventToCsvRow(event: IClickhouseEvent): string {
    const escapeCsvValue = (value: any): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      // Replace double quotes with single quotes, then escape single quotes by doubling them
      const withSingleQuotes = str.replace(/"/g, "'");
      return `'${withSingleQuotes.replace(/'/g, "''")}'`;
    };

    // Order matches the ClickHouse table schema exactly
    const columns = [
      event.id, // id UUID
      event.name, // name
      event.sdk_name, // sdk_name
      event.sdk_version, // sdk_version
      event.device_id, // device_id
      event.profile_id, // profile_id
      event.project_id, // project_id
      event.session_id, // session_id
      event.path, // path
      event.origin, // origin
      event.referrer, // referrer
      event.referrer_name, // referrer_name
      event.referrer_type, // referrer_type
      event.duration, // duration
      escapeCsvValue(JSON.stringify(event.properties)), // properties
      event.created_at, // created_at
      event.country, // country
      event.city, // city
      event.region, // region
      event.longitude, // longitude
      event.latitude, // latitude
      event.os, // os
      event.os_version, // os_version
      event.browser, // browser
      event.browser_version, // browser_version
      event.device, // device
      event.brand, // brand
      event.model, // model
      event.imported_at, // imported_at
    ];

    return columns.join(',');
  }

  /**
   * Get CSV headers matching the ClickHouse table schema
   */
  private getCsvHeaders(): string {
    return [
      'id',
      'name',
      'sdk_name',
      'sdk_version',
      'device_id',
      'profile_id',
      'project_id',
      'session_id',
      'path',
      'origin',
      'referrer',
      'referrer_name',
      'referrer_type',
      'duration',
      'properties',
      'created_at',
      'country',
      'city',
      'region',
      'longitude',
      'latitude',
      'os',
      'os_version',
      'browser',
      'browser_version',
      'device',
      'brand',
      'model',
      'imported_at',
    ].join(',');
  }

  bulkAdd(events: IClickhouseEvent[]) {
    const multi = this.redis.multi();
    for (const event of events) {
      this.add(event, multi);
    }
    return multi.exec();
  }

  async add(event: IClickhouseEvent, _multi?: ReturnType<Redis['multi']>) {
    try {
      const eventJson = JSON.stringify(event);
      const multi = _multi || this.redis.multi();
      if (event.name !== 'session_start' && event.name !== 'session_end') {
        multi.incr('event:buffer:counter');
      }

      multi.rpush(this.redisKey, eventJson).incr(this.bufferCounterKey);

      // Store last screen_view for event enrichment
      if (event.name === 'screen_view' && event.profile_id) {
        const lastEventKey = this.getLastEventKey({
          projectId: event.project_id,
          profileId: event.profile_id,
        });
        multi.set(lastEventKey, eventJson, 'EX', this.lastScreenViewTTL);
      }

      // Clear last screen_view on session_end
      if (event.name === 'session_end' && event.profile_id) {
        const lastEventKey = this.getLastEventKey({
          projectId: event.project_id,
          profileId: event.profile_id,
        });
        multi.del(lastEventKey);
      }

      if (event.profile_id) {
        this.incrementActiveVisitorCount(
          multi,
          event.project_id,
          event.profile_id,
        );
      }

      if (!_multi) {
        await multi.exec();
      }

      await publishEvent('events', 'received', transformEvent(event));

      // Check buffer length using counter
      const bufferLength = await this.getBufferSize();

      if (bufferLength >= this.batchSize) {
        await this.tryFlush();
      }
    } catch (error) {
      this.logger.error('Failed to add event to Redis buffer', { error });
    }
  }

  /**
   * Retrieve the latest screen_view event for a given project/profile
   * Used for event enrichment - inheriting properties from last screen view
   */
  public async getLastScreenView({
    projectId,
    profileId,
  }: {
    projectId: string;
    profileId: string;
  }): Promise<IServiceEvent | null>;
  public async getLastScreenView({
    projectId,
    sessionId,
  }: {
    projectId: string;
    sessionId: string;
  }): Promise<IServiceEvent | null>;
  public async getLastScreenView({
    projectId,
    profileId,
    sessionId,
  }: {
    projectId: string;
    profileId?: string;
    sessionId?: string;
  }): Promise<IServiceEvent | null> {
    if (profileId) {
      const redis = getRedisCache();
      const eventStr = await redis.get(
        this.getLastEventKey({ projectId, profileId }),
      );
      if (eventStr) {
        const parsed = getSafeJson<IClickhouseEvent>(eventStr);
        if (parsed) {
          return transformEvent(parsed);
        }
      }
    }

    // sessionId lookup not supported in simplified version
    // Events are processed immediately, no session-specific storage
    return null;
  }

  private getLastEventKey({
    projectId,
    profileId,
  }: {
    projectId: string;
    profileId: string;
  }) {
    return `session:last_screen_view:${projectId}:${profileId}`;
  }

  /**
   * Atomically pop a batch of events from the buffer
   * Multiple workers can call this in parallel without conflicts
   */
  private async popBatch(batchSize: number): Promise<string[]> {
    try {
      // LPOP with count - single atomic operation (Redis 6.2+)
      // This is significantly more efficient than looping
      const items = await this.redis.lpop(this.redisKey, batchSize);

      if (!items) {
        return [];
      }

      // LPOP with count returns either a single string or array
      const itemsArray = Array.isArray(items) ? items : [items];

      // Update counter atomically
      if (itemsArray.length > 0) {
        await this.redis.decrby(this.bufferCounterKey, itemsArray.length);
      }

      return itemsArray;
    } catch (error) {
      this.logger.error('Failed to pop batch atomically', { error });
      return [];
    }
  }

  /**
   * Push failed events back to retry buffer or DLQ
   * Updates counters atomically to maintain accurate counts in parallel mode
   */
  private async pushToRetry(
    events: string[],
    retryCount: number,
  ): Promise<void> {
    if (events.length === 0) return;

    const multi = this.redis.multi();
    let retryEvents = 0;
    let dlqEvents = 0;

    for (const event of events) {
      const retryItem = JSON.stringify({
        event,
        retryCount: retryCount + 1,
        lastAttempt: Date.now(),
      });

      if (retryCount >= this.maxRetries) {
        // Max retries exceeded, send to DLQ
        multi.rpush(this.dlqKey, retryItem);
        dlqEvents++;
      } else {
        // Push to retry buffer
        multi.rpush(this.retryKey, retryItem);
        retryEvents++;
      }
    }

    // Update counters atomically in the same transaction
    if (retryEvents > 0) {
      multi.incrby(this.retryCounterKey, retryEvents);
    }
    if (dlqEvents > 0) {
      multi.incrby(this.dlqCounterKey, dlqEvents);
    }

    await multi.exec();

    if (dlqEvents > 0) {
      this.logger.warn(`Pushed ${dlqEvents} events to DLQ after max retries`, {
        retryCount: retryCount + 1,
      });
    }
    if (retryEvents > 0) {
      this.logger.warn(`Pushed ${retryEvents} events to retry buffer`, {
        retryCount: retryCount + 1,
      });
    }
  }

  /**
   * Process buffer with parallel worker support
   * Multiple workers can call this simultaneously and will atomically claim batches
   */
  async processBuffer() {
    const events = await this.popBatch(this.batchSize);

    if (events.length === 0) {
      this.logger.debug('No events to process');
      return;
    }

    try {
      await this.processEventsChunk(events);

      this.logger.debug('Processed events from Redis buffer', {
        count: events.length,
      });
    } catch (error) {
      this.logger.error('Error processing Redis buffer, pushing to retry', {
        error,
        eventCount: events.length,
      });

      // Push events back to retry buffer to prevent data loss
      await this.pushToRetry(events, 0);
    }
  }

  /**
   * Process retry buffer - events that failed to insert
   * Handles counter updates atomically for parallel worker safety
   */
  async processRetryBuffer() {
    try {
      // Pop from retry buffer atomically
      const retryItems = await this.redis.lpop(this.retryKey, this.batchSize);

      if (!retryItems) {
        this.logger.debug('No retry events to process');
        return;
      }

      const itemsArray = Array.isArray(retryItems) ? retryItems : [retryItems];

      if (itemsArray.length === 0) return;

      // Decrement retry counter atomically (events are now claimed by this worker)
      await this.redis.decrby(this.retryCounterKey, itemsArray.length);

      // Parse retry items
      const parsedItems = itemsArray
        .map((item) => {
          try {
            return JSON.parse(item) as {
              event: string;
              retryCount: number;
              lastAttempt: number;
            };
          } catch {
            return null;
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      const events = parsedItems.map((item) => item.event);
      const maxRetryCount = Math.max(...parsedItems.map((i) => i.retryCount));

      this.logger.debug('Processing retry buffer', {
        count: events.length,
        maxRetryCount,
      });

      try {
        await this.processEventsChunk(events);

        this.logger.debug('Successfully processed retry events', {
          count: events.length,
        });
      } catch (error) {
        this.logger.error('Failed to process retry events', {
          error,
          eventCount: events.length,
          maxRetryCount,
        });

        // Push back to retry/DLQ with incremented count
        // This will update the appropriate counter (retry or DLQ)
        await this.pushToRetry(events, maxRetryCount);
      }
    } catch (error) {
      this.logger.error('Error in retry buffer processing', { error });
    }
  }

  /**
   * Process a chunk of event strings (used by both processBuffer and drainBuffer)
   */
  private async processEventsChunk(events: string[]) {
    const eventsToClickhouse = events
      .map((e) => getSafeJson<IClickhouseEvent>(e))
      .filter((e): e is IClickhouseEvent => e !== null);

    // Sort events by creation time
    eventsToClickhouse.sort(
      (a, b) =>
        new Date(a.created_at || 0).getTime() -
        new Date(b.created_at || 0).getTime(),
    );

    this.logger.debug('Inserting events into ClickHouse', {
      totalEvents: eventsToClickhouse.length,
      chunks: Math.ceil(eventsToClickhouse.length / this.chunkSize),
    });

    // Insert events into ClickHouse in chunks using CSV format with headers
    for (const chunk of this.chunks(eventsToClickhouse, this.chunkSize)) {
      if (process.env.USE_CSV === 'true' || process.env.USE_CSV === '1') {
        // Convert events to CSV format
        const csvRows = chunk.map((event) => this.eventToCsvRow(event));
        const csv = [this.getCsvHeaders(), ...csvRows].join('\n');

        // Create a readable stream in binary mode for CSV
        const csvStream = Readable.from(csv, { objectMode: false });

        await ch.insert({
          table: 'events',
          values: csvStream,
          format: 'CSV',
          clickhouse_settings: {
            input_format_csv_skip_first_lines: '1',
            format_csv_allow_single_quotes: 1,
            format_csv_allow_double_quotes: 1,
          },
        });

        await getRedisCache().incrby('event:buffer:csv:counter', chunk.length);
      } else {
        await getRedisCache().incrby('event:buffer:json:counter', chunk.length);
        await ch.insert({
          table: 'events',
          values: chunk,
          format: 'JSONEachRow',
        });
      }
    }

    // Publish "saved" events
    const pubMulti = getRedisPub().multi();
    for (const event of eventsToClickhouse) {
      await publishEvent('events', 'saved', transformEvent(event), pubMulti);
    }
    await pubMulti.exec();
  }

  async getBufferSize() {
    return this.getBufferSizeWithCounter(() => this.redis.llen(this.redisKey));
  }

  /**
   * Get retry buffer size with counter optimization
   */
  async getRetryBufferSize(): Promise<number> {
    try {
      const counterValue = await this.redis.get(this.retryCounterKey);
      if (counterValue !== null) {
        const parsed = Number.parseInt(counterValue, 10);
        if (!Number.isNaN(parsed)) {
          return Math.max(0, parsed);
        }
      }

      // Fallback: get actual size and initialize counter
      const count = await this.redis.llen(this.retryKey);
      await this.redis.set(this.retryCounterKey, count.toString());
      return count;
    } catch (error) {
      this.logger.warn(
        'Failed to get retry buffer size from counter, using fallback',
        { error },
      );
      return this.redis.llen(this.retryKey);
    }
  }

  /**
   * Get dead letter queue size with counter optimization
   */
  async getDLQSize(): Promise<number> {
    try {
      const counterValue = await this.redis.get(this.dlqCounterKey);
      if (counterValue !== null) {
        const parsed = Number.parseInt(counterValue, 10);
        if (!Number.isNaN(parsed)) {
          return Math.max(0, parsed);
        }
      }

      // Fallback: get actual size and initialize counter
      const count = await this.redis.llen(this.dlqKey);
      await this.redis.set(this.dlqCounterKey, count.toString());
      return count;
    } catch (error) {
      this.logger.warn('Failed to get DLQ size from counter, using fallback', {
        error,
      });
      return this.redis.llen(this.dlqKey);
    }
  }

  /**
   * Get comprehensive buffer stats
   */
  async getBufferStats() {
    const [main, retry, dlq] = await Promise.all([
      this.getBufferSize(),
      this.getRetryBufferSize(),
      this.getDLQSize(),
    ]);

    return {
      main,
      retry,
      dlq,
      total: main + retry,
    };
  }

  /**
   * Inspect DLQ events (for debugging/monitoring)
   * @param limit - Number of events to inspect (default: 10)
   */
  async inspectDLQ(limit = 10) {
    const items = await this.redis.lrange(this.dlqKey, 0, limit - 1);

    return items
      .map((item) => {
        try {
          return JSON.parse(item) as {
            event: string;
            retryCount: number;
            lastAttempt: number;
          };
        } catch {
          return null;
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  /**
   * Clear dead letter queue (use with caution!)
   * Also resets the DLQ counter
   */
  async clearDLQ(): Promise<number> {
    const size = await this.getDLQSize();
    if (size > 0) {
      const multi = this.redis.multi();
      multi.del(this.dlqKey);
      multi.set(this.dlqCounterKey, '0');
      await multi.exec();

      this.logger.warn('DLQ cleared', { eventsRemoved: size });
    }
    return size;
  }

  private async incrementActiveVisitorCount(
    multi: ReturnType<Redis['multi']>,
    projectId: string,
    profileId: string,
  ) {
    // Track active visitors and emit expiry events when inactive for TTL
    const now = Date.now();
    const zsetKey = `live:visitors:${projectId}`;
    const heartbeatKey = `live:visitor:${projectId}:${profileId}`;
    return multi
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
