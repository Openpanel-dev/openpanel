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

  private chunkSize = process.env.REPLAY_BUFFER_INSERT_CHUNK_SIZE
    ? Number.parseInt(process.env.REPLAY_BUFFER_INSERT_CHUNK_SIZE, 10)
    : 50;

  // Cluster-safe hash tag keeps key on the same Redis slot across cluster nodes
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
    return this.timeAdd(async () => {
      try {
        const result = await this.redis
          .multi()
          .rpush(this.redisKey, JSON.stringify(chunk))
          .incr(this.bufferCounterKey)
          .llen(this.redisKey)
          .exec();

        const bufferLength = (result?.[2]?.[1] as number) ?? 0;
        if (bufferLength >= this.batchSize) {
          await this.tryFlush({ trigger: 'add' });
        }
      } catch (error) {
        this.logger.error('Failed to add replay chunk to buffer', { error });
      }
    });
  }

  async processBuffer() {
    const lrangeStart = performance.now();
    const items = await this.redis.lrange(this.redisKey, 0, this.batchSize - 1);
    const lrangeMs = performance.now() - lrangeStart;

    if (items.length === 0) {
      this.reportFlushStats({ rowsProcessed: 0, phases: { lrangeMs } });
      return;
    }

    const chStart = performance.now();
    await this.parallelLimit(this.chunks(items, this.chunkSize), (chunk) =>
      ch.insert({
        table: TABLE_NAMES.session_replay_chunks,
        values: chunk.map((item) => JSON.parse(item)),
        format: 'JSONEachRow',
        clickhouse_settings: this.getClickhouseSettings(),
      }),
    );
    const chInsertMs = performance.now() - chStart;

    const trimStart = performance.now();
    await this.redis
      .multi()
      .ltrim(this.redisKey, items.length, -1)
      .decrby(this.bufferCounterKey, items.length)
      .exec();
    const trimMs = performance.now() - trimStart;

    this.reportFlushStats({
      rowsProcessed: items.length,
      phases: { lrangeMs, chInsertMs, trimMs },
    });

    this.logger.debug('Processed replay chunks', { count: items.length });
  }

  async getBufferSize() {
    return this.getBufferSizeWithCounter(() => this.redis.llen(this.redisKey));
  }
}
