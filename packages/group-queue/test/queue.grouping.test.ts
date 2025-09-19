import Redis from 'ioredis';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Queue, Worker } from '../src';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

describe('grouping', () => {
  let redis: Redis;
  let namespace: string;

  beforeEach(async () => {
    // Create fresh Redis connection and namespace for each test
    redis = new Redis(REDIS_URL);
    namespace =
      'test:q1:' + Date.now() + ':' + Math.random().toString(36).substring(7);

    // flush only this namespace keys (best-effort)
    const keys = await redis.keys(`${namespace}*`);
    if (keys.length) await redis.del(keys);
  });

  afterEach(async () => {
    // Clean up after each test
    const keys = await redis.keys(`${namespace}*`);
    if (keys.length) await redis.del(keys);
    await redis.quit();
  });

  it('process jobs in correct order based on orderMs', async () => {
    const q = new Queue({ redis, namespace, visibilityTimeoutMs: 5000 });

    const order: Array<string> = [];
    const worker = new Worker<{ n: number }>({
      redis,
      namespace,
      handler: async (job) => {
        console.log(
          `Processing job n:${job.payload.n}, orderMs:${job.orderMs}, score:${job.score}, seq:${job.seq}`,
        );
        order.push(`${job.groupId}:${job.payload.n}`);
        await wait(50);
      },
      visibilityTimeoutMs: 3000,
      pollIntervalMs: 5,
    });
    const jobs = [
      {
        groupId: 'g1',
        payload: { n: 2 },
        orderMs: new Date('2025-01-01 00:00:00.500').getTime(),
      },
      {
        groupId: 'g1',
        payload: { n: 4 },
        orderMs: new Date('2025-01-01 00:01:01.000').getTime(),
      },
      {
        groupId: 'g1',
        payload: { n: 3 },
        orderMs: new Date('2025-01-01 00:00:00.800').getTime(),
      },
      {
        groupId: 'g1',
        payload: { n: 1 },
        orderMs: new Date('2025-01-01 00:00:00.000').getTime(),
      },
    ];

    console.log(
      'Expected order by orderMs:',
      jobs
        .slice()
        .sort((a, b) => a.orderMs - b.orderMs)
        .map((j) => `n:${j.payload.n} (${j.orderMs})`),
    );

    // Enqueue ALL jobs first, then start worker to avoid race conditions
    for (const job of jobs) {
      const jobId = await q.add(job);
      console.log(
        `Enqueued job n:${job.payload.n}, orderMs:${job.orderMs}, jobId:${jobId}`,
      );
    }

    // Now start the worker after all jobs are enqueued
    worker.run();

    await wait(500); // Give more time

    console.log('Actual processing order:', order);
    console.log(
      'Expected processing order:',
      jobs
        .slice()
        .sort((a, b) => a.orderMs - b.orderMs)
        .map((j) => `${j.groupId}:${j.payload.n}`),
    );

    expect(order).toEqual(
      jobs
        .slice()
        .sort((a, b) => a.orderMs - b.orderMs)
        .map((j) => `${j.groupId}:${j.payload.n}`),
    );

    await worker.stop();
  });

  it('should handle ordering delay for late events', async () => {
    const orderingDelayMs = 1000; // 1 second delay (shorter for faster test)
    const q = new Queue({
      redis,
      namespace: namespace + ':delay',
      orderingDelayMs,
    });

    const order: Array<string> = [];
    const worker = new Worker<{ n: number }>({
      redis,
      namespace: namespace + ':delay',
      orderingDelayMs, // Pass the ordering delay to the worker
      handler: async (job) => {
        console.log(
          `Processing job n:${job.payload.n}, orderMs:${job.orderMs}, processedAt:${Date.now()}`,
        );
        order.push(`${job.groupId}:${job.payload.n}`);
        await wait(10);
      },
      visibilityTimeoutMs: 5000,
      pollIntervalMs: 50,
    });

    const now = Date.now();

    // Scenario: Events arrive out of order, but we want to process them in order
    console.log(`Starting scenario at ${now}`);

    // Enqueue jobs with timestamps in a way that tests the delay
    await q.add({
      groupId: 'delay-group',
      payload: { n: 3 },
      orderMs: now + 1500, // Future timestamp, should be delayed
    });

    await q.add({
      groupId: 'delay-group',
      payload: { n: 1 },
      orderMs: now - 5000, // Past timestamp, should be processed immediately
    });

    await q.add({
      groupId: 'delay-group',
      payload: { n: 2 },
      orderMs: now - 1000, // Past timestamp, between job 1 and 3
    });

    console.log(`Enqueued all jobs at ${Date.now()}`);

    // Start worker
    worker.run();

    // Wait for processing to complete
    await wait(2500);

    console.log(`Final order: ${order}`);
    console.log(`Jobs processed: ${order.length}`);

    // Should process in correct chronological order
    expect(order.length).toBe(3);
    expect(order).toEqual(['delay-group:1', 'delay-group:2', 'delay-group:3']);

    await worker.stop();
  }, 4000); // Timeout for the 2.5s wait + buffer
});

async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
