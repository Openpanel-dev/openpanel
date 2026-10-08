import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Readable } from 'node:stream';
import { getRedisCache } from '@openpanel/redis';
import { bufferDepsWithCh } from '../../test/buffer-fixtures';
import { testCoreConfig } from '../../test/config-fixture';
import {
  type IClickhouseSessionReplayChunk,
  ReplayBuffer,
} from './replay-buffer';

const redis = getRedisCache();
const REDIS_KEY = 'replay-buffer';
const ONE_MB = 1024 * 1024;
/** The production backlog's shape: more 1 MB chunks than one 8 MB batch holds. */
const BACKLOG_CHUNKS = 30;
/** One LRANGE slice past the byte budget is the most a batch may overshoot. */
const MAX_ROWS_PER_BATCH_OF_1MB = 10;

const insertedBatches: string[][] = [];
const chInsert = mock(async (options: { values: Readable }) => {
  const rows: string[] = [];
  for await (const row of options.values) {
    rows.push(row as string);
  }
  insertedBatches.push(rows);
});

function bufferWithBatchSize(batchSize: number) {
  const config = testCoreConfig();
  config.buffers.replay.batchSize = batchSize;
  return new ReplayBuffer(bufferDepsWithCh({ insert: chInsert }, config));
}

function chunk(index: number, payloadBytes: number) {
  return {
    project_id: 'project-1',
    session_id: 'session-1',
    chunk_index: index,
    started_at: '2026-10-08 09:00:00',
    ended_at: '2026-10-08 09:00:10',
    events_count: 1,
    is_full_snapshot: false,
    payload: 'x'.repeat(payloadBytes),
  } satisfies IClickhouseSessionReplayChunk;
}

beforeEach(async () => {
  await redis.del(REDIS_KEY, 'lock:replay');
  insertedBatches.length = 0;
  chInsert.mockClear();
});

describe('ReplayBuffer', () => {
  it('only appends on add, even far past the batch size', async () => {
    const buffer = bufferWithBatchSize(2);

    for (let index = 0; index < 5; index++) {
      await buffer.add(chunk(index, 10));
    }

    expect(await redis.llen(REDIS_KEY)).toBe(5);
    expect(chInsert).not.toHaveBeenCalled();
  });

  it('drains a backlog of 1 MB chunks in byte-bounded batches in one flush', async () => {
    const buffer = bufferWithBatchSize(1000);
    for (let index = 0; index < BACKLOG_CHUNKS; index++) {
      await buffer.add(chunk(index, ONE_MB));
    }

    await buffer.tryFlush({ trigger: 'cron' });

    expect(await redis.llen(REDIS_KEY)).toBe(0);
    expect(chInsert.mock.calls.length).toBeGreaterThan(1);
    const insertedIndexes = insertedBatches
      .flat()
      .map((row) => (JSON.parse(row) as { chunk_index: number }).chunk_index);
    expect(insertedIndexes).toEqual(
      Array.from({ length: BACKLOG_CHUNKS }, (_, index) => index)
    );
    for (const batch of insertedBatches) {
      expect(batch.length).toBeLessThanOrEqual(MAX_ROWS_PER_BATCH_OF_1MB);
    }
  });

  it('keeps the batch when the insert fails and drains it on the next flush', async () => {
    const buffer = bufferWithBatchSize(1000);
    for (let index = 0; index < 3; index++) {
      await buffer.add(chunk(index, 10));
    }
    chInsert.mockImplementationOnce(() =>
      Promise.reject(new Error('clickhouse down'))
    );

    await buffer.tryFlush({ trigger: 'cron' });
    expect(await redis.llen(REDIS_KEY)).toBe(3);

    await buffer.tryFlush({ trigger: 'cron' });
    expect(await redis.llen(REDIS_KEY)).toBe(0);
    expect(insertedBatches.flat()).toHaveLength(3);
  });
});
