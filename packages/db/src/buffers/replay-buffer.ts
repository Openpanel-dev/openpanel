import { Buffer } from 'node:buffer';

import { getRedisCache } from '@openpanel/redis';
import { ch, TABLE_NAMES } from '../clickhouse/client';
import type { ILogger } from '@openpanel/logger';
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

// JSONEachRow rejects raw control characters (U+0000–U+001F) inside strings —
// including newlines and tabs: a "pretty-printed" multi-line object parses
// fine via JSON.parse but is multiple lines to the JSONEachRow reader and
// fails the whole insert. `JSON.stringify` always escapes control characters,
// so a raw one anywhere in the row proves the entry was corrupted in Redis.
// A single such entry fails the ENTIRE batch insert and, because the LTRIM
// below only runs on success, permanently wedges the buffer: it never drains,
// grows unbounded, and (prod 2026-10-07) filled shared Redis to maxmemory,
// taking down ingestion for every tenant until the poisoned rows were
// repaired by hand.
const RAW_CONTROL_CHARS = /[\u0000-\u001f]/;

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

// Strict env parsing: `Number.parseInt('10_000')` is 10 (it stops at the
// underscore) and `Number.parseInt('abc')` is NaN — the latter silently
// disables every `>=`/`>` comparison it feeds, the former would trim 99.9%
// of the buffer on the next flush. Accept only positive safe integers
// (underscores allowed for readability) and fall back with a warning.
function parsePositiveIntEnv(name: string, fallback: number, logger: ILogger): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw.trim().replaceAll('_', ''));
  if (!Number.isSafeInteger(value) || value <= 0) {
    logger.warn(`Invalid ${name}='${raw}', falling back to ${fallback}`, { name, raw, fallback });
    return fallback;
  }
  return value;
}

export class ReplayBuffer extends BaseBuffer {
  private batchSize: number;
  private chunkSize: number;
  // Hard cap on the Redis list, enforced on BOTH paths (see processBuffer
  // and add). Bounds the memory a wedged consumer can pin on a SHARED Redis
  // instance: worst case maxBufferSize × maxEntryBytes = 2,500 × 512KiB ≈
  // 1.22GiB — under half of the 2560mb maxmemory of the shared prod
  // instance, leaving the majority of headroom for the other tenants
  // (Harbor queues, oauth2-proxy sessions, Atlantis locks) plus Redis
  // overhead. Typical footprint is far smaller (~580MB at the ~240KB/entry
  // observed in the incident). Self-hosted dedicated instances can raise
  // both via env. The shared-instance memory-pressure page alert
  // (used/maxmemory at 90%) remains the outer backstop.
  private maxBufferSize: number;
  // Per-entry cap: one giant chunk must not dominate the buffer budget.
  // Typical rrweb chunks are 10–100KB; 512KiB is ~5x the largest observed
  // legit entry while still bounding a hostile/broken writer.
  private maxEntryBytes: number;

  private readonly redisKey = 'replay-buffer';

  constructor() {
    super({
      name: 'replay',
      onFlush: async () => {
        await this.processBuffer();
      },
    });
    this.batchSize = parsePositiveIntEnv('REPLAY_BUFFER_BATCH_SIZE', 500, this.logger);
    this.chunkSize = parsePositiveIntEnv('REPLAY_BUFFER_CHUNK_SIZE', 500, this.logger);
    this.maxBufferSize = parsePositiveIntEnv('REPLAY_BUFFER_MAX_SIZE', 2_500, this.logger);
    this.maxEntryBytes = parsePositiveIntEnv('REPLAY_BUFFER_MAX_ENTRY_BYTES', 512 * 1024, this.logger);
  }

  async add(chunk: IClickhouseSessionReplayChunk) {
    return this.timeAdd(async () => {
      try {
        const redis = getRedisCache();
        const serialized = JSON.stringify(chunk);
        // Measure in UTF-8 bytes (what Redis stores), not UTF-16 code units:
        // multibyte payload text can make .length undercount substantially.
        const bytes = Buffer.byteLength(serialized, 'utf8');
        if (bytes > this.maxEntryBytes) {
          this.logger.warn('Dropped oversized replay chunk', {
            bytes,
            maxEntryBytes: this.maxEntryBytes,
            session_id: chunk.session_id,
          });
          return;
        }
        // Admission control, atomic on the Redis side: RPUSH only while the
        // list is below the cap, else refuse the NEW chunk. During a
        // ClickHouse outage every flush throws before its trim, and this is
        // what stops the list from growing past the cap — the pending
        // backlog keeps its head, and no LTRIM runs here (head-trims stay
        // under the flush lock, see processBuffer). The EVAL also keeps
        // RPUSH+LLEN atomic, so the flush trigger below sees an exact LLEN.
        const bufferLength = (await redis.eval(
          `local l = redis.call('LLEN', KEYS[1])
if l >= tonumber(ARGV[1]) then
  return -1
end
redis.call('RPUSH', KEYS[1], ARGV[2])
return l + 1`,
          1,
          this.redisKey,
          String(this.maxBufferSize),
          serialized,
        )) as number;
        if (bufferLength === -1) {
          this.logger.warn('Replay buffer full, dropped new chunk', {
            maxBufferSize: this.maxBufferSize,
            bytes,
            session_id: chunk.session_id,
          });
          return;
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
    // ALL head-trims live here, under the flush lock taken by tryFlush: an
    // add-side LTRIM between this method's LRANGE and LTRIM would shift
    // indexes and make the flush drop an entry it read but never inserted.
    // add() only RPUSHes (tail), so indexes are stable for this window.
    const trimStart = performance.now();
    await redis.ltrim(this.redisKey, items.length, -1);

    // Enforce the buffer cap here as well — over-limit entries can only be
    // dropped safely under the same lock. A burst of adds may overshoot the
    // cap between flushes; the next flush (cron ~10s or add-triggered) trims
    // back down.
    const llen = await redis.llen(this.redisKey);
    if (llen > this.maxBufferSize) {
      const dropped = llen - this.maxBufferSize;
      await redis.ltrim(this.redisKey, dropped, -1);
      this.logger.warn('Replay buffer exceeded max size, dropped oldest entries', {
        bufferLength: llen,
        maxBufferSize: this.maxBufferSize,
        dropped,
      });
    }
    const trimMs = performance.now() - trimStart;

    this.reportFlushStats({
      rowsProcessed: validItems.length,
      phases: { lrangeMs, chInsertMs, trimMs },
    });
  }
}
