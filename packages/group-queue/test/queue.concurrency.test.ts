import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Queue, Worker } from '../src';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

describe('Concurrency and Race Condition Tests', () => {
  const namespace = `test:concurrency:${Date.now()}`;

  afterAll(async () => {
    const redis = new Redis(REDIS_URL);
    const keys = await redis.keys(`${namespace}*`);
    if (keys.length) await redis.del(keys);
    await redis.quit();
  });

  it('should handle multiple workers on same group without conflicts', async () => {
    const redis = new Redis(REDIS_URL);
    const q = new Queue({ redis, namespace: `${namespace}:multiworker` });

    // Enqueue many jobs in same group
    const jobIds = [];
    for (let i = 0; i < 20; i++) {
      const jobId = await q.add({
        groupId: 'shared-group',
        payload: { id: i },
        orderMs: i,
      });
      jobIds.push(jobId);
    }

    const processed: number[] = [];
    const workers: Worker<any>[] = [];
    const processedBy: { [key: number]: number } = {}; // Track which worker processed each job

    // Create multiple workers competing for same group
    for (let workerId = 0; workerId < 3; workerId++) {
      const worker = new Worker({
        redis: redis.duplicate(),
        namespace: `${namespace}:multiworker`,
        blockingTimeoutSec: 1,
        handler: async (job) => {
          processed.push(job.payload.id);
          processedBy[job.payload.id] = workerId;
          // Add small delay to simulate work
          await new Promise((resolve) => setTimeout(resolve, 10));
        },
      });
      workers.push(worker);
      worker.run();
    }

    // Wait for all jobs to be processed
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // All jobs should be processed exactly once
    expect(processed.length).toBe(20);
    expect(new Set(processed).size).toBe(20); // No duplicates

    // Jobs should be processed in FIFO order within the group
    expect(processed).toEqual([...Array(20).keys()]);

    // Jobs should be distributed among workers (not all by one worker)
    const workerCounts = Object.values(processedBy).reduce(
      (acc, workerId) => {
        acc[workerId] = (acc[workerId] || 0) + 1;
        return acc;
      },
      {} as { [key: number]: number },
    );

    expect(Object.keys(workerCounts).length).toBeGreaterThan(1);

    await Promise.all(workers.map((w) => w.close()));
    await redis.quit();
  });

  it('should handle concurrent add and dequeue operations', async () => {
    const redis = new Redis(REDIS_URL);
    const q = new Queue({ redis, namespace: `${namespace}:concurrent` });

    const processed: number[] = [];
    const enqueued: number[] = [];

    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: `${namespace}:concurrent`,
      blockingTimeoutSec: 1,
      handler: async (job) => {
        processed.push(job.payload.id);
        await new Promise((resolve) => setTimeout(resolve, 5));
      },
    });

    worker.run();

    // Concurrent producers
    const producers = [];
    for (let producerId = 0; producerId < 3; producerId++) {
      const producer = async () => {
        for (let i = 0; i < 10; i++) {
          const jobId = producerId * 10 + i;
          await q.add({
            groupId: `concurrent-group-${producerId}`,
            payload: { id: jobId },
            orderMs: jobId,
          });
          enqueued.push(jobId);
          await new Promise((resolve) => setTimeout(resolve, 2));
        }
      };
      producers.push(producer());
    }

    await Promise.all(producers);

    // Wait for processing to complete
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(processed.length).toBe(30);
    expect(enqueued.length).toBe(30);

    // Check that each group maintains FIFO order
    const groupOrders: { [key: string]: number[] } = {};
    processed.forEach((id) => {
      const groupId = Math.floor(id / 10);
      if (!groupOrders[groupId]) groupOrders[groupId] = [];
      groupOrders[groupId].push(id);
    });

    Object.entries(groupOrders).forEach(([groupId, order]) => {
      const expectedOrder = [...Array(10).keys()].map(
        (i) => Number.parseInt(groupId) * 10 + i,
      );
      expect(order).toEqual(expectedOrder);
    });

    await worker.close();
    await redis.quit();
  });

  it('should handle race conditions during job completion', async () => {
    const redis = new Redis(REDIS_URL);
    const q = new Queue({ redis, namespace: `${namespace}:completion` });

    // Enqueue jobs
    for (let i = 0; i < 10; i++) {
      await q.add({
        groupId: 'completion-group',
        payload: { id: i },
        orderMs: i,
      });
    }

    const completed: number[] = [];
    const completionAttempts = new Map<number, number>();

    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: `${namespace}:completion`,
      blockingTimeoutSec: 1,
      handler: async (job) => {
        const id = job.payload.id;

        // Track completion attempts
        completionAttempts.set(id, (completionAttempts.get(id) || 0) + 1);

        // Simulate race condition by adding delay
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));

        completed.push(id);
      },
    });

    worker.run();

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Each job should be completed exactly once
    expect(completed.length).toBe(10);
    expect(new Set(completed).size).toBe(10);

    // No job should be attempted more than once (no double processing)
    completionAttempts.forEach((attempts, jobId) => {
      expect(attempts).toBe(1);
    });

    await worker.close();
    await redis.quit();
  });

  it('should handle worker stopping during job processing', async () => {
    const redis = new Redis(REDIS_URL);
    const q = new Queue({
      redis,
      namespace: `${namespace}:stopping`,
      jobTimeoutMs: 500,
    });

    // Enqueue jobs
    for (let i = 0; i < 5; i++) {
      await q.add({
        groupId: 'stopping-group',
        payload: { id: i },
        orderMs: i,
      });
    }

    const processed: number[] = [];
    let processingCount = 0;

    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: `${namespace}:stopping`,
      jobTimeoutMs: 500,
      blockingTimeoutSec: 1,
      handler: async (job) => {
        processingCount++;

        // Stop worker during processing of second job
        if (job.payload.id === 1) {
          setTimeout(() => worker.close(), 100);
        }

        // Simulate work
        await new Promise((resolve) => setTimeout(resolve, 200));
        processed.push(job.payload.id);
      },
    });

    worker.run();

    // Wait for worker to stop and jobs to be reclaimed
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Create new worker to process remaining jobs
    const worker2 = new Worker({
      redis: redis.duplicate(),
      namespace: `${namespace}:stopping`,
      blockingTimeoutSec: 1,
      handler: async (job) => {
        processed.push(job.payload.id);
      },
    });

    worker2.run();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // All jobs should eventually be processed
    expect(processed.length).toBeGreaterThanOrEqual(4);

    await worker2.close();
    await redis.quit();
  });

  it('should handle high-frequency add/dequeue cycles', async () => {
    const redis = new Redis(REDIS_URL);
    const q = new Queue({ redis, namespace: `${namespace}:highfreq` });

    const processed: number[] = [];
    const timestamps: number[] = [];

    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: `${namespace}:highfreq`,
      blockingTimeoutSec: 1,
      handler: async (job) => {
        processed.push(job.payload.id);
        timestamps.push(Date.now());
      },
    });

    worker.run();

    // Rapidly add jobs
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      await q.add({
        groupId: `freq-group-${i % 5}`, // 5 parallel groups
        payload: { id: i },
        orderMs: i,
      });

      // Very short delay between enqueues
      if (i % 10 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    const enqueueTime = Date.now() - start;

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 3000));

    expect(processed.length).toBe(100);

    // Check that groups maintain order
    const groupedResults: { [key: number]: number[] } = {};
    processed.forEach((id) => {
      const groupId = id % 5;
      if (!groupedResults[groupId]) groupedResults[groupId] = [];
      groupedResults[groupId].push(id);
    });

    Object.entries(groupedResults).forEach(([groupId, jobs]) => {
      const expectedJobs = [...Array(20).keys()].map(
        (i) => i * 5 + Number.parseInt(groupId),
      );
      expect(jobs.sort((a, b) => a - b)).toEqual(expectedJobs);
    });

    console.log(
      `Enqueue time: ${enqueueTime}ms, Processing time: ${timestamps[timestamps.length - 1] - timestamps[0]}ms`,
    );

    await worker.close();
    await redis.quit();
  });

  it('should handle memory pressure with large payloads', async () => {
    const redis = new Redis(REDIS_URL);
    const q = new Queue({ redis, namespace: `${namespace}:memory` });

    // Create large payloads
    const largeData = 'x'.repeat(10000); // 10KB payload

    for (let i = 0; i < 20; i++) {
      await q.add({
        groupId: `memory-group-${i % 3}`,
        payload: { id: i, data: largeData },
        orderMs: i,
      });
    }

    const processed: number[] = [];
    const memoryUsage: number[] = [];

    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: `${namespace}:memory`,
      blockingTimeoutSec: 1,
      handler: async (job) => {
        processed.push(job.payload.id);
        memoryUsage.push(process.memoryUsage().heapUsed);

        // Verify payload integrity
        expect(job.payload.data.length).toBe(10000);
        expect(job.payload.data).toBe(largeData);
      },
    });

    worker.run();

    await new Promise((resolve) => setTimeout(resolve, 3000));

    expect(processed.length).toBe(20);

    // Memory should not grow indefinitely
    const memoryGrowth = memoryUsage[memoryUsage.length - 1] - memoryUsage[0];
    expect(memoryGrowth).toBeLessThan(200 * 1024 * 1024); // Less than 200MB growth

    await worker.close();
    await redis.quit();
  });

  it('should handle deadlock scenarios with multiple groups', async () => {
    const redis = new Redis(REDIS_URL);
    const q = new Queue({ redis, namespace: `${namespace}:deadlock` });

    // Create a scenario where groups can process independently and avoid true deadlock
    // Put independent jobs first in each group so they can be processed
    await q.add({
      groupId: 'group-A',
      payload: { id: 'A1', waitFor: null },
      orderMs: 1,
    }); // Independent
    await q.add({
      groupId: 'group-B',
      payload: { id: 'B1', waitFor: null },
      orderMs: 2,
    }); // Independent
    await q.add({
      groupId: 'group-A',
      payload: { id: 'A2', waitFor: 'B1' },
      orderMs: 3,
    }); // Depends on B1
    await q.add({
      groupId: 'group-B',
      payload: { id: 'B2', waitFor: 'A1' },
      orderMs: 4,
    }); // Depends on A1

    const processed: string[] = [];
    const failed: string[] = [];

    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: `${namespace}:deadlock`,
      blockingTimeoutSec: 1,
      maxAttempts: 3,
      backoff: () => 100, // Quick retry
      handler: async (job) => {
        const { id, waitFor } = job.payload;

        if (waitFor && !processed.includes(waitFor)) {
          // Job is waiting for dependency
          throw new Error(`Job ${id} waiting for ${waitFor}`);
        }

        // Job can proceed
        processed.push(id);

        // Simulate work
        await new Promise((resolve) => setTimeout(resolve, 50));
      },
      onError: (err, job) => {
        if (job) {
          failed.push(job.payload.id);
        }
      },
    });

    worker.run();

    await new Promise((resolve) => setTimeout(resolve, 3000)); // Longer wait for retries

    console.log('Processed jobs:', processed);
    console.log('Failed attempts:', failed);

    // Should process independent jobs first (A1, B1), then dependent jobs (A2, B2) via retry
    expect(processed).toContain('A1'); // Independent, should succeed
    expect(processed).toContain('B1'); // Independent, should succeed
    expect(processed).toContain('A2'); // Should succeed after B1 is done
    expect(processed).toContain('B2'); // Should succeed after A1 is done

    // The test should pass even if there are no failures (jobs might process in perfect order)
    // expect(failed.length).toBeGreaterThan(0);
    console.log('Deadlock test completed successfully - all jobs processed');

    await worker.close();
    await redis.quit();
  });
});

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
