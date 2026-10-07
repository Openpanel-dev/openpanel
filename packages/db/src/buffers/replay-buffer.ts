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

// JSONEachRow rejects raw control characters (U+0000–U+0008, U+000B, U+000C,
// U+000E–U+001F) inside strings. `JSON.stringify` always escapes them, so a
// raw one means the entry was corrupted in Redis. A single such entry fails
// the ENTIRE batch insert and, because the LTRIM below only runs on success,
// permanently wedges the buffer: it never drains, grows unbounded, and (prod
// 2026-10-07) filled shared Redis to maxmemory, taking down ingestion for
// every tenant until the poisoned rows were repaired by hand.
const RAW_CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

function isValidChunkRow(row: string): boolean {
  if (RAW_CONTROL_CHARS.test(row)) {
    return false;
  }
  try {
    const parsed = JSON.parse(row) as Partial<IClickhouseSessionReplayChunk>;
    return (
      typeof parsed.project_id === 'string' &&
      typeof parsed.session_id === 'string' &&
      typeof parsed.payload === 'string'
    );
  } catch {
    return false;
  }
}

export class ReplayBuffer extends BaseBuffer {
  private batchSize = process.env.REPLAY_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.REPLAY_BUFFER_BATCH_SIZE, 10)
    : 500;
  private chunkSize = process.env.REPLAY_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.REPLAY_BUFFER_CHUNK_SIZE, 10)
    : 500;
  // Hard cap on the Redis list. If the consumer cannot drain (ClickHouse
  // outage, crashed worker, wedged flush), the buffer grows until it fills
  // Redis itself — with maxmemory-policy=noeviction that turns one tenant's
  // stuck queue into write failures for every tenant on the instance. The
  // oldest entries are dropped first: stale replays are the least valuable
  // data on the whole server.
  private maxBufferSize = process.env.REPLAY_BUFFER_MAX_SIZE
    ? Number.parseInt(process.env.REPLAY_BUFFER_MAX_SIZE, 10)
    : 10_000;

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
        if (bufferLength > this.maxBufferSize) {
          const dropped = bufferLength - this.maxBufferSize;
          await redis.ltrim(this.redisKey, dropped, -1);
          this.logger.warn('Replay buffer exceeded max size, dropped oldest entries', {
            bufferLength,
            maxBufferSize: this.maxBufferSize,
            dropped,
          });
        }
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

    // Validate before insert: ClickHouse rejects the whole batch on the first
    // malformed row, and since the LTRIM below only runs on success, one bad
    // entry would wedge the buffer forever. Corrupted rows are dropped (they
    // are unparseable and can never be inserted) while the healthy majority
    // still flows through.
    const validItems: string[] = [];
    let droppedCount = 0;
    let firstDroppedIndex = -1;
    items.forEach((row, index) => {
      if (isValidChunkRow(row)) {
        validItems.push(row);
      } else {
        droppedCount += 1;
        if (firstDroppedIndex === -1) {
          firstDroppedIndex = index;
        }
      }
    });

    if (droppedCount > 0) {
      this.logger.warn('Dropped corrupted replay-buffer entries during flush', {
        droppedCount,
        firstDroppedIndex,
        batchSize: items.length,
      });
    }

    let chInsertMs = 0;
    if (validItems.length > 0) {
      // Raw passthrough: each valid Redis entry is already a valid JSONEachRow
      // line (we JSON.stringify a single chunk before rpush). Streaming the
      // raw strings to CH skips JSON.parse × N on the worker AND the
      // client's internal JSON.stringify × N — significant because each
      // rrweb chunk's `payload` is 10–100KB.
      const chStart = performance.now();
      await this.parallelLimit(
        this.chunks(validItems, this.chunkSize),
        (chunk) =>
          ch.insert({
            table: TABLE_NAMES.session_replay_chunks,
            values: this.jsonEachRowStream(chunk),
            format: 'JSONEachRow',
            clickhouse_settings: this.getClickhouseSettings(),
          }),
      );
      chInsertMs = performance.now() - chStart;
    }

    // Trim the consumed batch (including the dropped rows) — but only after a
    // successful insert, so a ClickHouse outage still retains everything.
    const trimStart = performance.now();
    await redis.ltrim(this.redisKey, items.length, -1);
    const trimMs = performance.now() - trimStart;

    this.reportFlushStats({
      rowsProcessed: validItems.length,
      phases: { lrangeMs, chInsertMs, trimMs },
    });
  }
}
