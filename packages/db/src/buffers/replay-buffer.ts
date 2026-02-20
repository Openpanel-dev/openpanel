import { getSafeJson } from '@openpanel/json';
import { getRedisCache } from '@openpanel/redis';
import { TABLE_NAMES, ch } from '../clickhouse/client';
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
    try {
      const redis = getRedisCache();
      const result = await redis
        .multi()
        .rpush(this.redisKey, JSON.stringify(chunk))
        .incr(this.bufferCounterKey)
        .llen(this.redisKey)
        .exec();

      const bufferLength = (result?.[2]?.[1] as number) ?? 0;
      if (bufferLength >= this.batchSize) {
        await this.tryFlush();
      }
    } catch (error) {
      this.logger.error('Failed to add replay chunk to buffer', { error });
    }
  }

  async processBuffer() {
    const redis = getRedisCache();
    try {
      const items = await redis.lrange(this.redisKey, 0, this.batchSize - 1);

      if (items.length === 0) {
        return;
      }

      const chunks = items
        .map((item) => getSafeJson<IClickhouseSessionReplayChunk>(item))
        .filter((item): item is IClickhouseSessionReplayChunk => item != null);

      for (const chunk of this.chunks(chunks, this.chunkSize)) {
        await ch.insert({
          table: TABLE_NAMES.session_replay_chunks,
          values: chunk,
          format: 'JSONEachRow',
        });
      }

      await redis
        .multi()
        .ltrim(this.redisKey, items.length, -1)
        .decrby(this.bufferCounterKey, items.length)
        .exec();

      this.logger.debug('Processed replay chunks', { count: items.length });
    } catch (error) {
      this.logger.error('Failed to process replay buffer', { error });
    }
  }

  async getBufferSize() {
    const redis = getRedisCache();
    return this.getBufferSizeWithCounter(() => redis.llen(this.redisKey));
  }
}
