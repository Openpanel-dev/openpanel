import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Queue, Worker } from '../src';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

describe('retry keeps failed job as head and respects backoff', () => {
  const redis = new Redis(REDIS_URL);
  const namespace = 'test:q2:' + Date.now();

  beforeAll(async () => {
    const keys = await redis.keys(`${namespace}*`);
    if (keys.length) await redis.del(keys);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('retries a failing job up to maxAttempts and never lets later jobs overtake', async () => {
    const q = new Queue({ redis, namespace, visibilityTimeoutMs: 800 });

    // add 2 jobs in same group; first will fail 2 times then succeed
    const j1 = await q.add({
      groupId: 'gX',
      payload: { id: 'A' },
      orderMs: 1000,
      maxAttempts: 3,
    });
    const j2 = await q.add({
      groupId: 'gX',
      payload: { id: 'B' },
      orderMs: 2000,
      maxAttempts: 3,
    });

    let aFailures = 0;
    const processed: string[] = [];

    const worker = new Worker<{ id: string }>({
      redis,
      namespace,
      visibilityTimeoutMs: 600,
      pollIntervalMs: 5,
      backoff: (attempt) => 100, // fixed short backoff for test
      handler: async (job) => {
        if (job.payload.id === 'A' && aFailures < 2) {
          aFailures++;
          throw new Error('boom');
        }
        processed.push(job.payload.id);
      },
    });
    worker.run();

    await wait(1500);

    // A must be processed before B, despite retries
    expect(processed[0]).toBe('A');
    expect(processed[1]).toBe('B');

    // Ensure A failed twice before success
    expect(aFailures).toBe(2);

    await worker.stop();
  });

  it('visibility timeout reclaim works (no heartbeat)', async () => {
    const ns = namespace + ':vt:' + Date.now();
    const r2 = new Redis(REDIS_URL);
    const q = new Queue({ redis: r2, namespace: ns, visibilityTimeoutMs: 200 });

    await q.add({ groupId: 'g1', payload: { n: 1 }, orderMs: 1 });
    await q.add({ groupId: 'g1', payload: { n: 2 }, orderMs: 2 });

    // Worker that reserves then crashes (simulate by not completing)
    const job = await q.reserve();
    expect(job).toBeTruthy();

    // Wait for visibility to expire so the group becomes eligible again
    await wait(300);

    const processed: number[] = [];
    const worker = new Worker<{ n: number }>({
      redis: r2,
      namespace: ns,
      visibilityTimeoutMs: 300,
      pollIntervalMs: 5,
      handler: async (j) => {
        processed.push(j.payload.n);
      },
    });
    worker.run();

    await wait(500);
    console.log(processed);

    // We expect item 1 to be retried (at-least-once) and then item 2
    expect(processed[0]).toBe(1);
    expect(processed[1]).toBe(2);

    await worker.stop();
    await r2.quit();
  });
});

async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
