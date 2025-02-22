import { type Redis, getRedisCache } from '@openpanel/redis';

import { getSafeJson } from '@openpanel/json';
import { TABLE_NAMES, ch } from '../clickhouse/client';
import type { IClickhouseBotEvent } from '../services/event.service';
import { BaseBuffer } from './base-buffer';

export class BotBuffer extends BaseBuffer {
  private batchSize = process.env.BOT_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.BOT_BUFFER_BATCH_SIZE, 10)
    : 1000;

  private readonly redisKey = 'bot-events-buffer';
  private redis: Redis;
  constructor() {
    super({
      name: 'bot',
      onFlush: async () => {
        await this.processBuffer();
      },
    });
    this.redis = getRedisCache();
  }

  async add(event: IClickhouseBotEvent) {
    try {
      // Add event to Redis list
      await this.redis.rpush(this.redisKey, JSON.stringify(event));

      // Check buffer length
      const bufferLength = await this.redis.llen(this.redisKey);

      if (bufferLength >= this.batchSize) {
        await this.tryFlush();
      }
    } catch (error) {
      this.logger.error('Failed to add bot event', { error });
    }
  }

  async processBuffer() {
    try {
      // Get events from the start without removing them
      const events = await this.redis.lrange(
        this.redisKey,
        0,
        this.batchSize - 1,
      );

      if (events.length === 0) return;

      const parsedEvents = events.map((e) =>
        getSafeJson<IClickhouseBotEvent>(e),
      );

      // Insert to ClickHouse
      await ch.insert({
        table: TABLE_NAMES.events_bots,
        values: parsedEvents,
        format: 'JSONEachRow',
      });

      // Only remove events after successful insert
      await this.redis.ltrim(this.redisKey, events.length, -1);

      this.logger.info('Processed bot events', {
        count: events.length,
      });
    } catch (error) {
      this.logger.error('Failed to process buffer', { error });
    }
  }

  async getBufferSize() {
    return getRedisCache().llen(this.redisKey);
  }
}
