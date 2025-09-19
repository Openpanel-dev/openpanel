import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Queue, Worker } from '../src';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

describe('basic per-group FIFO and parallelism', () => {
  const redis = new Redis(REDIS_URL);
  const namespace = 'test:q1:' + Date.now();

  beforeAll(async () => {
    // flush only this namespace keys (best-effort)
    const keys = await redis.keys(`${namespace}*`);
    if (keys.length) await redis.del(keys);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('processes FIFO within group by orderMs and in parallel across groups', async () => {
    const q = new Queue({ redis, namespace, jobTimeoutMs: 5000 });

    const seen: Array<string> = [];
    const worker = new Worker<{ n: number }>({
      redis,
      namespace,
      handler: async (job) => {
        seen.push(`${job.groupId}:${job.payload.n}`);
        await wait(50);
      },
      jobTimeoutMs: 3000,
    });
    worker.run();

    // add two groups interleaved; orderMs ensures deterministic order inside group
    await q.add({ groupId: 'gA', payload: { n: 1 }, orderMs: 1000 });
    await q.add({ groupId: 'gA', payload: { n: 2 }, orderMs: 2000 });
    await q.add({ groupId: 'gB', payload: { n: 3 }, orderMs: 1500 });
    await q.add({ groupId: 'gB', payload: { n: 4 }, orderMs: 1600 });

    await wait(400);

    // Check FIFO inside each group
    const aIndices = seen.filter((s) => s.startsWith('gA:'));
    const bIndices = seen.filter((s) => s.startsWith('gB:'));
    expect(aIndices).toEqual(['gA:1', 'gA:2']);
    expect(bIndices).toEqual(['gB:3', 'gB:4']);

    // Ensure we processed at least 3-4 items overall
    expect(seen.length).toBeGreaterThanOrEqual(3);

    await worker.close();
  });
});

async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
