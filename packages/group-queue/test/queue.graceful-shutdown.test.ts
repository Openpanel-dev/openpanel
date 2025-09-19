import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Queue, Worker, getWorkersStatus } from '../src';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

describe('Graceful Shutdown Tests', () => {
  const namespace = `test:graceful:${Date.now()}`;

  afterAll(async () => {
    // Cleanup after all tests
    const redis = new Redis(REDIS_URL);
    const keys = await redis.keys(`${namespace}*`);
    if (keys.length) await redis.del(keys);
    await redis.quit();
  });

  it('should track active job count correctly', async () => {
    const redis = new Redis(REDIS_URL);
    const queue = new Queue({ redis, namespace: `${namespace}:count` });

    // Initially should be 0
    expect(await queue.getActiveCount()).toBe(0);

    // Add some jobs
    await queue.add({ groupId: 'test-group', payload: { id: 1 } });
    await queue.add({ groupId: 'test-group', payload: { id: 2 } });

    // Still 0 since no worker is processing
    expect(await queue.getActiveCount()).toBe(0);

    let job1Started = false;
    let job1CanComplete = false;
    const processed: number[] = [];

    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: `${namespace}:count`,
      handler: async (job) => {
        if (job.payload.id === 1) {
          job1Started = true;
          // Wait for signal to complete
          while (!job1CanComplete) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
        processed.push(job.payload.id);
      },
    });

    worker.run();

    // Wait for job 1 to start processing
    while (!job1Started) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Should have 1 active job now
    expect(await queue.getActiveCount()).toBe(1);

    // Signal job 1 to complete
    job1CanComplete = true;

    // Wait for all jobs to be processed
    while (processed.length < 2) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Should be back to 0
    expect(await queue.getActiveCount()).toBe(0);

    await worker.close();
    await redis.quit();
  });

  it('should wait for queue to empty', async () => {
    const redis = new Redis(REDIS_URL);
    const queue = new Queue({ redis, namespace: `${namespace}:empty` });

    // Should return true immediately if already empty
    expect(await queue.waitForEmpty(1000)).toBe(true);

    // Add jobs and start processing
    await queue.add({ groupId: 'empty-group', payload: { id: 1 } });
    await queue.add({ groupId: 'empty-group', payload: { id: 2 } });

    let processedCount = 0;
    const processedIds: number[] = [];
    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: `${namespace}:empty`,
      handler: async (job) => {
        await new Promise((resolve) => setTimeout(resolve, 200)); // Simulate work
        processedCount++;
        processedIds.push(job.payload.id);
      },
    });

    worker.run();

    // Wait for jobs to start processing - check that active count > 0
    let waitAttempts = 0;
    while ((await queue.getActiveCount()) === 0 && waitAttempts < 20) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      waitAttempts++;
    }

    // Verify that processing has started
    expect(await queue.getActiveCount()).toBeGreaterThan(0);

    // Should wait and return true when empty
    const startTime = Date.now();
    const isEmpty = await queue.waitForEmpty(5000);
    const elapsed = Date.now() - startTime;

    expect(isEmpty).toBe(true);
    expect(processedCount).toBe(2);
    expect(processedIds.sort()).toEqual([1, 2]);
    expect(elapsed).toBeGreaterThan(350); // Should take at least 200ms + 200ms for two jobs

    await worker.close();
    await redis.quit();
  });

  it('should track current job in worker', async () => {
    const redis = new Redis(REDIS_URL);
    const queue = new Queue({ redis, namespace: `${namespace}:current` });

    let jobStarted = false;
    let jobCanComplete = false;

    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: `${namespace}:current`,
      handler: async (job) => {
        jobStarted = true;
        while (!jobCanComplete) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      },
    });

    // Initially no job
    expect(worker.isProcessing()).toBe(false);
    expect(worker.getCurrentJob()).toBe(null);

    worker.run();

    // Add a job
    await queue.add({ groupId: 'current-group', payload: { id: 1 } });

    // Wait for job to start
    while (!jobStarted) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Give it a moment to track the processing time
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should be processing now
    expect(worker.isProcessing()).toBe(true);

    const currentJob = worker.getCurrentJob();
    expect(currentJob).not.toBe(null);
    expect(currentJob!.job.payload.id).toBe(1);
    expect(currentJob!.processingTimeMs).toBeGreaterThan(0);

    // Signal completion
    jobCanComplete = true;

    // Wait for job to complete
    while (worker.isProcessing()) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(worker.getCurrentJob()).toBe(null);

    await worker.close();
    await redis.quit();
  });

  it('should stop worker gracefully', async () => {
    const redis = new Redis(REDIS_URL);
    const queue = new Queue({ redis, namespace: `${namespace}:graceful` });

    let jobStarted = false;
    let jobCompleted = false;

    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: `${namespace}:graceful`,
      handler: async (job) => {
        jobStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate work
        jobCompleted = true;
      },
    });

    worker.run();

    // Add a job
    await queue.add({ groupId: 'graceful-group', payload: { id: 1 } });

    // Wait for job to start
    while (!jobStarted) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(worker.isProcessing()).toBe(true);

    // Stop gracefully - should wait for job to complete
    const stopPromise = worker.close(2000); // 2 second timeout

    // Job should complete
    await stopPromise;

    expect(jobCompleted).toBe(true);
    expect(worker.isProcessing()).toBe(false);

    await redis.quit();
  });

  it('should timeout graceful stop if job takes too long', async () => {
    const redis = new Redis(REDIS_URL);
    const queue = new Queue({ redis, namespace: `${namespace}:timeout` });

    let jobStarted = false;
    let shouldStop = false;
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: `${namespace}:timeout`,
      handler: async (job) => {
        jobStarted = true;
        // Simulate a long-running job
        while (!shouldStop) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      },
    });

    worker.run();

    // Add a job
    await queue.add({ groupId: 'timeout-group', payload: { id: 1 } });

    // Wait for job to start
    while (!jobStarted) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(worker.isProcessing()).toBe(true);

    // Stop with short timeout - should timeout
    const startTime = Date.now();
    await worker.close(200); // 200ms timeout
    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeGreaterThan(190);
    expect(elapsed).toBeLessThan(400);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Worker stopped with job still processing'),
    );

    shouldStop = true; // Allow the handler to finish
    consoleSpy.mockRestore();
    await redis.quit();
  });

  it('should get workers status correctly', async () => {
    const redis = new Redis(REDIS_URL);
    const queue = new Queue({ redis, namespace: `${namespace}:status` });

    let job1Started = false;
    let job1CanComplete = false;

    const workers = [
      new Worker({
        redis: redis.duplicate(),
        namespace: `${namespace}:status`,
        handler: async (job) => {
          if (job.payload.id === 1) {
            job1Started = true;
            while (!job1CanComplete) {
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
          } else {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        },
      }),
      new Worker({
        redis: redis.duplicate(),
        namespace: `${namespace}:status`,
        handler: async (job) => {
          if (job.payload.id === 1) {
            job1Started = true;
            while (!job1CanComplete) {
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
          } else {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        },
      }),
    ];

    workers.forEach((worker) => worker.run());

    // Initially all idle
    let status = getWorkersStatus(workers);
    expect(status.total).toBe(2);
    expect(status.processing).toBe(0);
    expect(status.idle).toBe(2);

    // Add a job
    await queue.add({ groupId: 'status-group', payload: { id: 1 } });

    // Wait for job to start with timeout
    let startAttempts = 0;
    while (!job1Started && startAttempts < 200) {
      // 10 second timeout
      await new Promise((resolve) => setTimeout(resolve, 50));
      startAttempts++;
    }

    // Ensure job started
    expect(job1Started).toBe(true);

    // Should have 1 processing, 1 idle
    status = getWorkersStatus(workers);
    expect(status.total).toBe(2);
    expect(status.processing).toBe(1);
    expect(status.idle).toBe(1);

    const processingWorker = status.workers.find((w) => w.isProcessing);
    expect(processingWorker).toBeDefined();
    expect(processingWorker!.currentJob?.jobId).toBeDefined();

    // Signal completion
    job1CanComplete = true;

    // Wait for ANY worker to finish processing (since we don't know which one got the job)
    let attempts = 0;
    while (workers.some((w) => w.isProcessing()) && attempts < 100) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      attempts++;
    }

    // Ensure we didn't timeout
    expect(attempts).toBeLessThan(100);

    // Back to all idle
    status = getWorkersStatus(workers);
    expect(status.processing).toBe(0);
    expect(status.idle).toBe(2);

    await Promise.all(workers.map((w) => w.close()));
    await redis.quit();
  });
});
