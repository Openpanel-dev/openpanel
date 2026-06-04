import { getRedisCache, type Redis } from '@openpanel/redis';
import { ch, TABLE_NAMES } from '../clickhouse/client';
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

  protected getRedisListKey(): string {
    return this.redisKey;
  }

  async add(event: IClickhouseBotEvent) {
    return this.timeAdd(async () => {
      try {
        const result = await this.redis
          .multi()
          .rpush(this.redisKey, JSON.stringify(event))
          .llen(this.redisKey)
          .exec();

        const bufferLength = (result?.[1]?.[1] as number) ?? 0;
        if (bufferLength >= this.batchSize) {
          await this.tryFlush({ trigger: 'add' });
        }
      } catch (error) {
        this.logger.error({ err: error }, 'Failed to add bot event');
      }
    });
  }

  async processBuffer() {
    const lrangeStart = performance.now();
    const events = await this.redis.lrange(
      this.redisKey,
      0,
      this.batchSize - 1
    );
    const lrangeMs = performance.now() - lrangeStart;

    if (events.length === 0) {
      this.reportFlushStats({ rowsProcessed: 0, phases: { lrangeMs } });
      return;
    }

    // Raw passthrough: each Redis entry is already a valid JSONEachRow
    // line. Streaming raw strings skips JSON.parse + the client's
    // re-stringify on the hot path.
    const chStart = performance.now();
    await ch.insert({
      table: TABLE_NAMES.events_bots,
      values: this.jsonEachRowStream(events),
      format: 'JSONEachRow',
      clickhouse_settings: this.getClickhouseSettings(),
    });
    const chInsertMs = performance.now() - chStart;

    const trimStart = performance.now();
    await this.redis.ltrim(this.redisKey, events.length, -1);
    const trimMs = performance.now() - trimStart;

    this.reportFlushStats({
      rowsProcessed: events.length,
      phases: { lrangeMs, chInsertMs, trimMs },
    });
  }
}
