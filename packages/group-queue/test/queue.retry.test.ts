import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Queue, Worker } from '../src';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

describe('Retry Behavior Tests', () => {
  const redis = new Redis(REDIS_URL);
  const namespace = 'test:retry:' + Date.now();

  beforeAll(async () => {
    const keys = await redis.keys(`${namespace}*`);
    if (keys.length) await redis.del(keys);
  });

  afterAll(async () => {
    const keys = await redis.keys(`${namespace}*`);
    if (keys.length) await redis.del(keys);
    await redis.quit();
  });

  it('should respect maxAttempts and move to dead letter queue', async () => {
    const q = new Queue({
      redis,
      namespace: namespace + ':dlq',
      maxAttempts: 3,
    });

    // Enqueue a job that will always fail
    const jobId = await q.add({
      groupId: 'fail-group',
      payload: { shouldFail: true },
      maxAttempts: 2,
    });

    let attemptCount = 0;
    const worker = new Worker({
      redis,
      namespace: namespace + ':dlq',
      useBlocking: false,
      pollIntervalMs: 10,
      handler: async (job) => {
        attemptCount++;
        throw new Error(`Attempt ${attemptCount} failed`);
      },
    });

    worker.run();

    // Wait for all attempts to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Should have tried exactly maxAttempts times
    expect(attemptCount).toBe(2);

    // Job should no longer be reservable
    const job = await q.reserve();
    expect(job).toBeNull();

    await worker.stop();
  });

  it('should use exponential backoff correctly', async () => {
    const q = new Queue({ redis, namespace: namespace + ':backoff' });

    await q.add({
      groupId: 'backoff-group',
      payload: { test: 'backoff' },
      maxAttempts: 3,
    });

    const attempts: number[] = [];
    let failCount = 0;

    const worker = new Worker({
      redis,
      namespace: namespace + ':backoff',
      useBlocking: false,
      pollIntervalMs: 10,
      backoff: (attempt) => attempt * 100, // 100ms, 200ms, 300ms
      handler: async (job) => {
        attempts.push(Date.now());
        failCount++;
        if (failCount < 3) {
          throw new Error(`Fail ${failCount}`);
        }
        // Succeed on 3rd attempt
      },
    });

    worker.run();

    // Wait for all attempts
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(attempts.length).toBe(3);

    // Check that backoff delays were respected (with some tolerance)
    if (attempts.length >= 2) {
      const delay1 = attempts[1] - attempts[0];
      expect(delay1).toBeGreaterThan(80); // Should be ~100ms
    }

    if (attempts.length >= 3) {
      const delay2 = attempts[2] - attempts[1];
      expect(delay2).toBeGreaterThan(180); // Should be ~200ms
    }

    await worker.stop();
  });

  it('should handle mixed success/failure in same group', async () => {
    const q = new Queue({ redis, namespace: namespace + ':mixed' });

    // Enqueue multiple jobs in same group
    await q.add({
      groupId: 'mixed-group',
      payload: { id: 1, shouldFail: false },
      orderMs: 1,
    });
    await q.add({
      groupId: 'mixed-group',
      payload: { id: 2, shouldFail: true },
      orderMs: 2,
    });
    await q.add({
      groupId: 'mixed-group',
      payload: { id: 3, shouldFail: false },
      orderMs: 3,
    });

    const processed: number[] = [];
    let failureCount = 0;

    const worker = new Worker({
      redis,
      namespace: namespace + ':mixed',
      useBlocking: false,
      pollIntervalMs: 10,
      maxAttempts: 2,
      backoff: () => 50, // Quick retry
      handler: async (job) => {
        if (job.payload.shouldFail && failureCount === 0) {
          failureCount++;
          throw new Error('Intentional failure');
        }
        processed.push(job.payload.id);
      },
    });

    worker.run();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Should process in order: 1, 2 (retry), 3
    expect(processed).toEqual([1, 2, 3]);

    await worker.stop();
  });

  it('should handle retry with different error types', async () => {
    const q = new Queue({ redis, namespace: namespace + ':errors' });

    await q.add({ groupId: 'error-group', payload: { errorType: 'timeout' } });
    await q.add({ groupId: 'error-group', payload: { errorType: 'network' } });
    await q.add({ groupId: 'error-group', payload: { errorType: 'parse' } });

    const errors: string[] = [];
    const processed: string[] = [];

    const worker = new Worker({
      redis,
      namespace: namespace + ':errors',
      useBlocking: false,
      pollIntervalMs: 10,
      maxAttempts: 2,
      backoff: () => 10,
      handler: async (job) => {
        const { errorType } = job.payload;

        // Use a set to track which errors we've thrown
        const errorKey = `${errorType}-failed`;
        if (!processed.find((e) => e === errorKey)) {
          processed.push(errorKey);
          switch (errorType) {
            case 'timeout':
              throw new Error('Request timeout');
            case 'network':
              throw new Error('Network error');
            case 'parse':
              throw new Error('Parse error');
          }
        }

        processed.push(errorType);
      },
      onError: (err, job) => {
        errors.push(`${job?.payload.errorType}: ${(err as Error).message}`);
      },
    });

    worker.run();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Filter out the failure tracking entries
    const actualProcessed = processed.filter(
      (item) => !item.includes('-failed'),
    );
    expect(actualProcessed).toEqual(['timeout', 'network', 'parse']);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toContain('timeout: Request timeout');
    expect(errors[1]).toContain('network: Network error');
    expect(errors[2]).toContain('parse: Parse error');

    await worker.stop();
  });

  it('should maintain FIFO order during retries with multiple groups', async () => {
    const q = new Queue({ redis, namespace: namespace + ':multigroup' });

    // Create jobs in two groups with interleaved order
    await q.add({
      groupId: 'group-A',
      payload: { id: 'A1', fail: true },
      orderMs: 1,
    });
    await q.add({
      groupId: 'group-B',
      payload: { id: 'B1', fail: false },
      orderMs: 2,
    });
    await q.add({
      groupId: 'group-A',
      payload: { id: 'A2', fail: false },
      orderMs: 3,
    });
    await q.add({
      groupId: 'group-B',
      payload: { id: 'B2', fail: true },
      orderMs: 4,
    });

    const processed: string[] = [];
    const failedIds = new Set<string>();

    const worker = new Worker({
      redis,
      namespace: namespace + ':multigroup',
      useBlocking: false,
      pollIntervalMs: 10,
      backoff: () => 20,
      handler: async (job) => {
        const { id, fail } = job.payload;

        if (fail && !failedIds.has(id)) {
          failedIds.add(id);
          throw new Error(`${id} failed`);
        }

        processed.push(id);
      },
    });

    worker.run();

    await new Promise((resolve) => setTimeout(resolve, 2000)); // Longer wait for retries

    // Groups should maintain FIFO: A1(retry), A2, B1, B2(retry)
    // But groups can be processed in parallel
    expect(processed).toContain('A1');
    expect(processed).toContain('A2');
    expect(processed).toContain('B1');
    expect(processed).toContain('B2');

    // Within each group, order should be maintained
    const groupAOrder = processed.filter((id) => id.startsWith('A'));
    const groupBOrder = processed.filter((id) => id.startsWith('B'));

    expect(groupAOrder).toEqual(['A1', 'A2']);
    expect(groupBOrder).toEqual(['B1', 'B2']);

    await worker.stop();
  });
});

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
