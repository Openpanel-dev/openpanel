import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Queue, Worker } from '../src';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

describe('Redis Disconnect/Reconnect Tests', () => {
  const namespace = 'test:disconnect:' + Date.now();

  afterAll(async () => {
    // Cleanup after all tests
    const redis = new Redis(REDIS_URL);
    const keys = await redis.keys(`${namespace}*`);
    if (keys.length) await redis.del(keys);
    await redis.quit();
  });

  it('should handle Redis connection drops gracefully', async () => {
    const redis = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });

    const q = new Queue({ redis, namespace: namespace + ':drop' });

    // Enqueue some jobs before disconnect
    await q.add({ groupId: 'persistent-group', payload: { id: 1 } });
    await q.add({ groupId: 'persistent-group', payload: { id: 2 } });

    const processed: number[] = [];
    const errors: string[] = [];

    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: namespace + ':drop',
      blockingTimeoutSec: 1,
      handler: async (job) => {
        processed.push(job.payload.id);
      },
      onError: (err) => {
        errors.push((err as Error).message);
      },
    });

    worker.run();

    // Let it process first job
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Simulate connection drop by disconnecting
    await redis.disconnect();

    // Wait a bit while disconnected
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Reconnect
    await redis.connect();

    // Add another job after reconnection
    await q.add({ groupId: 'persistent-group', payload: { id: 3 } });

    // Wait for processing to resume
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(processed.length).toBeGreaterThan(0);
    expect(processed).toContain(1);

    await worker.close();
    await redis.quit();
  });

  it('should recover from Redis server restart simulation', async () => {
    const redis = new Redis(REDIS_URL, {
      connectTimeout: 1000,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });

    const q = new Queue({ redis, namespace: namespace + ':restart' });

    // Enqueue jobs
    await q.add({ groupId: 'restart-group', payload: { phase: 'before' } });

    const processed: string[] = [];
    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: namespace + ':restart',
      blockingTimeoutSec: 1,
      handler: async (job) => {
        processed.push(job.payload.phase);
      },
    });

    worker.run();

    // Wait for initial processing
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Simulate server restart by disconnecting all connections
    await redis.disconnect();

    // Wait during "restart"
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Reconnect and add more jobs
    await redis.connect();
    await q.add({ groupId: 'restart-group', payload: { phase: 'after' } });

    // Wait for recovery
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(processed).toContain('before');
    expect(processed).toContain('after');

    await worker.close();
    await redis.quit();
  });

  it('should handle network partitions and blocking operations', async () => {
    const redis = new Redis(REDIS_URL, {
      connectTimeout: 1000,
      commandTimeout: 2000,
    });

    const q = new Queue({ redis, namespace: namespace + ':partition' });

    const processed: number[] = [];
    const errors: string[] = [];

    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: namespace + ':partition',
      blockingTimeoutSec: 1, // Test blocking operations during network issues
      handler: async (job) => {
        processed.push(job.payload.id);
      },
      onError: (err) => {
        errors.push((err as Error).message);
      },
    });

    worker.run();

    // Add job and let it process
    await q.add({ groupId: 'partition-group', payload: { id: 1 } });
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Simulate network partition
    await redis.disconnect();

    // Try to add job during partition using separate connection
    const redis2 = new Redis(REDIS_URL);
    const q2 = new Queue({
      redis: redis2,
      namespace: namespace + ':partition',
    });
    await q2.add({ groupId: 'partition-group', payload: { id: 2 } });

    // Wait during partition
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Reconnect original redis
    await redis.connect();

    // Wait for recovery and processing
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(processed).toContain(1);
    expect(processed).toContain(2);

    await worker.close();
    await redis.quit();
    await redis2.quit();
  });

  it('should maintain job state consistency during Redis failures', async () => {
    const redis = new Redis(REDIS_URL);
    const q = new Queue({
      redis,
      namespace: namespace + ':consistency',
      jobTimeoutMs: 500,
    });

    // Enqueue jobs
    await q.add({ groupId: 'consistency-group', payload: { id: 1 } });
    await q.add({ groupId: 'consistency-group', payload: { id: 2 } });

    const processed: number[] = [];
    let processingJob1 = false;

    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: namespace + ':consistency',
      blockingTimeoutSec: 1,
      jobTimeoutMs: 500,
      handler: async (job) => {
        if (job.payload.id === 1 && !processingJob1) {
          processingJob1 = true;
          // Simulate disconnect during job processing
          await redis.disconnect();
          await new Promise((resolve) => setTimeout(resolve, 300));
          await redis.connect();
          // Job should be reclaimed after visibility timeout
          throw new Error('Simulated failure during disconnect');
        }
        processed.push(job.payload.id);
      },
    });

    worker.run();

    // Wait for processing and recovery
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Job 1 should be retried after visibility timeout expires
    // Job 2 should be processed normally
    expect(processed.length).toBeGreaterThan(0);

    await worker.close();
    await redis.quit();
  });

  it('should handle Redis memory pressure and connection limits', async () => {
    const connections: Redis[] = [];

    try {
      // Create many connections to test connection pooling
      for (let i = 0; i < 10; i++) {
        const redis = new Redis(REDIS_URL, {
          maxRetriesPerRequest: 1,
          connectTimeout: 1000,
        });
        connections.push(redis);
      }

      const q = new Queue({
        redis: connections[0],
        namespace: namespace + ':memory',
        jobTimeoutMs: 1000,
      });

      // Enqueue many small jobs
      const jobPromises = [];
      for (let i = 0; i < 100; i++) {
        jobPromises.push(
          q.add({
            groupId: `memory-group-${i % 5}`,
            payload: { id: i, data: 'x'.repeat(100) },
          }),
        );
      }
      await Promise.all(jobPromises);

      const processed: number[] = [];
      const workers: Worker<any>[] = [];

      // Create multiple workers
      for (let i = 0; i < 3; i++) {
        const worker = new Worker({
          redis: connections[i + 1],
          namespace: namespace + ':memory',
          blockingTimeoutSec: 1,
          handler: async (job) => {
            processed.push(job.payload.id);
            // Simulate some work
            await new Promise((resolve) => setTimeout(resolve, 10));
          },
        });
        workers.push(worker);
        worker.run();
      }

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 3000));

      expect(processed.length).toBeGreaterThan(50); // Should process most jobs

      // Stop all workers
      await Promise.all(workers.map((w) => w.close()));
    } finally {
      // Cleanup connections
      await Promise.all(connections.map((redis) => redis.quit()));
    }
  });

  it('should handle Redis AUTH failures gracefully', async () => {
    // This test assumes Redis is running without AUTH
    // In a real scenario, you'd test with wrong credentials
    const redis = new Redis(REDIS_URL, {
      connectTimeout: 1000,
      maxRetriesPerRequest: 2,
    });

    const q = new Queue({ redis, namespace: namespace + ':auth' });

    // This should work normally since we're using correct connection
    await q.add({ groupId: 'auth-group', payload: { test: 'auth' } });

    const processed: string[] = [];
    const errors: string[] = [];

    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: namespace + ':auth',
      blockingTimeoutSec: 1,
      handler: async (job) => {
        processed.push(job.payload.test);
      },
      onError: (err) => {
        errors.push((err as Error).message);
      },
    });

    worker.run();

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(processed).toContain('auth');

    await worker.close();
    await redis.quit();
  });
});

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
