import { beforeEach, describe, expect, it } from 'bun:test';
import { getRedisCache } from '@openpanel/redis';
import { stubBufferDeps } from '../../test/buffer-fixtures';
import { BaseBuffer, type FlushObservation } from './base-buffer';

const redis = getRedisCache();
const LOCK_TTL_SECONDS = 1;
const BATCH_SIZE = 2;

/** A buffer whose flush is whatever the test hands in, under a 1 s lock. */
class TestBuffer extends BaseBuffer {
  constructor(onFlush: () => Promise<void>) {
    super(stubBufferDeps, { name: 'lock-test', onFlush });
    this.lockTimeout = LOCK_TTL_SECONDS;
  }

  protected getRedisListKey(): string {
    return 'lock-test:queue';
  }

  drain(processBatch: () => Promise<number>): Promise<void> {
    return this.drainBatches(BATCH_SIZE, processBatch);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(async () => {
  await redis.del('lock:lock-test');
});

describe('BaseBuffer flush lock', () => {
  it('a flush that outlives the lock TTL keeps the lock until it is done', async () => {
    const ttlSamples: number[] = [];
    let concurrentResult: FlushObservation['result'] | undefined;
    const buffer = new TestBuffer(async () => {
      const otherWorker = new TestBuffer(() => Promise.resolve());
      otherWorker.flushObserver = (obs) => {
        concurrentResult = obs.result;
      };
      // Twice the TTL, sampling the lock on the way.
      for (let i = 0; i < 4; i++) {
        await sleep(LOCK_TTL_SECONDS * 500);
        ttlSamples.push(await redis.ttl('lock:lock-test'));
      }
      await otherWorker.tryFlush({ trigger: 'cron' });
    });

    await buffer.tryFlush({ trigger: 'cron' });

    expect(ttlSamples.every((ttl) => ttl > 0)).toBe(true);
    expect(concurrentResult).toBe('locked');
    expect(await redis.get('lock:lock-test')).toBeNull();
  });

  it('stops draining once the lock is no longer its own', async () => {
    let batches = 0;
    const processBatch = async () => {
      batches += 1;
      // Another holder took the key, as an expired lock would allow.
      await redis.set('lock:lock-test', 'someone-else');
      // Long enough for the keepalive to notice.
      await sleep(LOCK_TTL_SECONDS * 800);
      return BATCH_SIZE;
    };
    let buffer: TestBuffer;
    buffer = new TestBuffer(() => buffer.drain(processBatch));

    await buffer.tryFlush({ trigger: 'cron' });

    expect(batches).toBe(1);
    expect(await redis.get('lock:lock-test')).toBe('someone-else');
  });
});
