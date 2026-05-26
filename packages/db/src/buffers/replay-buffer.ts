import { getSafeJson } from '@openpanel/json';
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

  private insertChunkSize = process.env.REPLAY_BUFFER_INSERT_CHUNK_SIZE
    ? Number.parseInt(process.env.REPLAY_BUFFER_INSERT_CHUNK_SIZE, 10)
    : 50;

  private readonly redisKey = '{replay_buffer}:chunks';
  protected bufferCounterKey = '{replay_buffer}:count';

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
      const result = await this.redis
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
      this.logger.error('Failed to add replay chunk', { error });
    }
  }

  async processBuffer() {
    try {
      const items = await this.redis.lrange(
        this.redisKey,
        0,
        this.batchSize - 1,
      );

      if (items.length === 0) return;

      const chunks = items
        .map((item) => getSafeJson<IClickhouseSessionReplayChunk>(item))
        .filter((c): c is IClickhouseSessionReplayChunk => c != null);

      // Insert in smaller chunks since each payload can be up to ~1 MB.
      for (const slice of this.chunks(chunks, this.insertChunkSize)) {
        await ch.insert({
          table: TABLE_NAMES.session_replay_chunks,
          values: slice,
          format: 'JSONEachRow',
        });
      }

      await this.redis
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
    return this.getBufferSizeWithCounter(() => this.redis.llen(this.redisKey));
  }
}
