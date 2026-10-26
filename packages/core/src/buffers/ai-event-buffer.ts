// Redis list → ClickHouse `ai_events`. One row per AI event, written after
// its `events` row; a plain passthrough buffer with no merge step.

import { getRedisCache, type Redis } from '@openpanel/redis';
import type { IClickhouseAiEvent } from '../modules/ai/src/row';
import { TABLE_NAMES } from '../shared/ch-tables';
import { BaseBuffer, type BufferDeps } from './base-buffer';

const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_CHUNK_SIZE = 500;

export class AiEventBuffer extends BaseBuffer {
  private readonly batchSize =
    this.deps.config.buffers.aiEvent.batchSize ?? DEFAULT_BATCH_SIZE;
  private readonly chunkSize =
    this.deps.config.buffers.aiEvent.chunkSize ?? DEFAULT_CHUNK_SIZE;

  private readonly redisKey = 'ai-event-buffer';
  private readonly redis: Redis;

  constructor(deps: BufferDeps) {
    super(deps, {
      name: 'ai-event',
      onFlush: async () => {
        await this.processBuffer();
      },
    });
    this.redis = getRedisCache();
  }

  async add(row: IClickhouseAiEvent): Promise<void> {
    return this.timeAdd(async () => {
      try {
        await this.redis.rpush(this.redisKey, JSON.stringify(row));
      } catch (error) {
        this.logger.error({ err: error, id: row.id }, 'Failed to add ai event');
      }
    });
  }

  protected getRedisListKey(): string {
    return this.redisKey;
  }

  async processBuffer(): Promise<void> {
    await this.drainBatches(this.batchSize, () => this.processBatch());
  }

  private async processBatch(): Promise<number> {
    const lrangeStart = performance.now();
    const items = await this.redis.lrange(this.redisKey, 0, this.batchSize - 1);
    const lrangeMs = performance.now() - lrangeStart;

    if (items.length === 0) {
      this.reportFlushStats({ rowsProcessed: 0, phases: { lrangeMs } });
      return 0;
    }

    const ch = this.resolveCh();
    const chStart = performance.now();
    await this.parallelLimit(this.chunks(items, this.chunkSize), (chunk) =>
      ch.insert({
        table: TABLE_NAMES.ai_events,
        values: this.jsonEachRowStream(chunk),
        format: 'JSONEachRow',
        clickhouse_settings: this.getClickhouseSettings(),
      })
    );
    const chInsertMs = performance.now() - chStart;

    const trimStart = performance.now();
    await this.redis.ltrim(this.redisKey, items.length, -1);
    const trimMs = performance.now() - trimStart;

    this.reportFlushStats({
      rowsProcessed: items.length,
      phases: { lrangeMs, chInsertMs, trimMs },
    });
    return items.length;
  }
}
