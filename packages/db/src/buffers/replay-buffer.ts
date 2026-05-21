import { getSafeJson } from '@openpanel/json';
import { getRedisCache } from '@openpanel/redis';
import { ch, TABLE_NAMES } from '../clickhouse/client';
import { BaseBuffer } from './base-buffer';

export interface IClickhouseSessionReplayChunk {
  project_id: string;
  session_id: string;
  chunk_index: number;
  started_at: string;
  ended_at: string;
  events_count: number;
  is_full_snapshot: boolean;
  payload: string;
}

export class ReplayBuffer extends BaseBuffer {
  private batchSize = process.env.REPLAY_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.REPLAY_BUFFER_BATCH_SIZE, 10)
    : 500;
  private chunkSize = process.env.REPLAY_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.REPLAY_BUFFER_CHUNK_SIZE, 10)
    : 500;

  private readonly redisKey = 'replay-buffer';

  constructor() {
    super({
      name: 'replay',
      onFlush: async () => {
        await this.processBuffer();
      },
    });
  }

  async add(chunk: IClickhouseSessionReplayChunk) {
    return this.timeAdd(async () => {
      try {
        const redis = getRedisCache();
        const result = await redis
          .multi()
          .rpush(this.redisKey, JSON.stringify(chunk))
          .llen(this.redisKey)
          .exec();

        const bufferLength = (result?.[1]?.[1] as number) ?? 0;
        if (bufferLength >= this.batchSize) {
          await this.tryFlush({ trigger: 'add' });
        }
      } catch (error) {
        this.logger.error(
          { err: error },
          'Failed to add replay chunk to buffer'
        );
      }
    });
  }

  protected getRedisListKey(): string {
    return this.redisKey;
  }

  async processBuffer() {
    const redis = getRedisCache();

    const lrangeStart = performance.now();
    const items = await redis.lrange(this.redisKey, 0, this.batchSize - 1);
    const lrangeMs = performance.now() - lrangeStart;

    if (items.length === 0) {
      this.reportFlushStats({ rowsProcessed: 0, phases: { lrangeMs } });
      return;
    }

    const chunks = items
      .map((item) => getSafeJson<IClickhouseSessionReplayChunk>(item))
      .filter((item): item is IClickhouseSessionReplayChunk => item != null);

    const chStart = performance.now();
    await this.parallelLimit(this.chunks(chunks, this.chunkSize), (chunk) =>
      ch.insert({
        table: TABLE_NAMES.session_replay_chunks,
        values: chunk,
        format: 'JSONEachRow',
        clickhouse_settings: {
          async_insert: 1,
          wait_for_async_insert: 0,
          parallel_view_processing: 1,
        },
      })
    );
    const chInsertMs = performance.now() - chStart;

    const trimStart = performance.now();
    await redis.ltrim(this.redisKey, items.length, -1);
    const trimMs = performance.now() - trimStart;

    this.reportFlushStats({
      rowsProcessed: items.length,
      phases: { lrangeMs, chInsertMs, trimMs },
    });
  }
}
