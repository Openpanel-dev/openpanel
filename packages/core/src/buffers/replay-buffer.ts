import { getRedisCache } from '@openpanel/redis';
import { TABLE_NAMES } from '../shared/ch-tables';
import { BaseBuffer, type BufferDeps } from './base-buffer';

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

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_CHUNK_SIZE = 500;
/**
 * Chunks average ~270 KB and reach 1 MB, so a batch is bounded in bytes as well
 * as count, and read a few items per LRANGE: one count-sized read once asked
 * Redis for 260 MB, timed out on every retry and let the list grow unbounded.
 */
const READ_SLICE_SIZE = 10;
const MAX_BATCH_BYTES = 8 * 1024 * 1024;
/** One cron run drains as many batches as fit before the next run is due. */
const DRAIN_TIME_BUDGET_MS = 8000;

export class ReplayBuffer extends BaseBuffer {
  private readonly batchSize =
    this.deps.config.buffers.replay.batchSize ?? DEFAULT_BATCH_SIZE;
  private readonly chunkSize =
    this.deps.config.buffers.replay.chunkSize ?? DEFAULT_CHUNK_SIZE;

  private readonly redisKey = 'replay-buffer';

  constructor(deps: BufferDeps) {
    super(deps, {
      name: 'replay',
      onFlush: async () => {
        await this.processBuffer();
      },
    });
  }

  /**
   * Append only. Flushing is the cron's job: an add-triggered flush ran on
   * every API request once a backlog existed, inside the request.
   */
  async add(chunk: IClickhouseSessionReplayChunk) {
    return this.timeAdd(async () => {
      try {
        await getRedisCache().rpush(this.redisKey, JSON.stringify(chunk));
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
    const deadline = performance.now() + DRAIN_TIME_BUDGET_MS;
    let rowsProcessed = 0;
    const phases = { lrangeMs: 0, chInsertMs: 0, trimMs: 0 };

    while (performance.now() < deadline) {
      const lrangeStart = performance.now();
      const { items, reachedEnd } = await this.readBatch();
      phases.lrangeMs += performance.now() - lrangeStart;

      if (items.length > 0) {
        const chStart = performance.now();
        await this.insert(items);
        phases.chInsertMs += performance.now() - chStart;

        const trimStart = performance.now();
        await getRedisCache().ltrim(this.redisKey, items.length, -1);
        phases.trimMs += performance.now() - trimStart;
        rowsProcessed += items.length;
      }

      if (reachedEnd) {
        break;
      }
    }

    this.reportFlushStats({ rowsProcessed, phases });
  }

  /** The head of the list, up to `batchSize` items or `MAX_BATCH_BYTES`. */
  private async readBatch(): Promise<{ items: string[]; reachedEnd: boolean }> {
    const redis = getRedisCache();
    const items: string[] = [];
    let bytes = 0;

    while (items.length < this.batchSize && bytes < MAX_BATCH_BYTES) {
      const requested = Math.min(
        READ_SLICE_SIZE,
        this.batchSize - items.length
      );
      const slice = await redis.lrange(
        this.redisKey,
        items.length,
        items.length + requested - 1
      );
      for (const item of slice) {
        items.push(item);
        bytes += Buffer.byteLength(item);
      }
      if (slice.length < requested) {
        return { items, reachedEnd: true };
      }
    }

    return { items, reachedEnd: false };
  }

  // Raw passthrough: each Redis entry is already a JSONEachRow line, and an
  // rrweb chunk's `payload` is 10–100KB, so skipping parse/stringify matters.
  private async insert(items: string[]) {
    const ch = this.resolveCh();
    await this.parallelLimit(this.chunks(items, this.chunkSize), (chunk) =>
      ch.insert({
        table: TABLE_NAMES.session_replay_chunks,
        values: this.jsonEachRowStream(chunk),
        format: 'JSONEachRow',
        clickhouse_settings: this.getClickhouseSettings(),
      })
    );
  }
}
