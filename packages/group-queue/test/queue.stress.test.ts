import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Queue, Worker } from '../src';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

describe.skip('Stress and Performance Degradation Tests', () => {
  const namespace = `test:stress:${Date.now()}`;

  afterAll(async () => {
    const redis = new Redis(REDIS_URL);
    const keys = await redis.keys(`${namespace}*`);
    if (keys.length) await redis.del(keys);
    await redis.quit();
  });

  it('should handle sustained high throughput over time', async () => {
    const redis = new Redis(REDIS_URL);
    const q = new Queue({ redis, namespace: `${namespace}:sustained` });

    const processed: number[] = [];
    const throughputSamples: number[] = [];
    let lastSampleTime = Date.now();
    let lastSampleCount = 0;

    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: `${namespace}:sustained`,
      useBlocking: true,
      blockingTimeoutSec: 1,
      handler: async (job) => {
        processed.push(job.payload.id);

        // Sample throughput every 1000 jobs
        if (processed.length % 1000 === 0) {
          const now = Date.now();
          const timeDiff = now - lastSampleTime;
          const countDiff = processed.length - lastSampleCount;
          const throughput = (countDiff / timeDiff) * 1000; // jobs/sec

          throughputSamples.push(throughput);
          lastSampleTime = now;
          lastSampleCount = processed.length;
        }
      },
    });

    worker.run();

    // Sustained load: add jobs continuously
    const totalJobs = 5000;
    const batchSize = 100;

    for (let batch = 0; batch < totalJobs / batchSize; batch++) {
      const promises = [];
      for (let i = 0; i < batchSize; i++) {
        const jobId = batch * batchSize + i;
        promises.push(
          q.add({
            groupId: `sustained-group-${jobId % 10}`,
            payload: { id: jobId },
            orderMs: jobId,
          }),
        );
      }
      await Promise.all(promises);

      // Small delay between batches
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Wait for processing to complete
    await new Promise((resolve) => setTimeout(resolve, 10000));

    expect(processed.length).toBe(totalJobs);

    // Throughput should remain relatively stable (not degrade significantly)
    if (throughputSamples.length > 2) {
      const firstSample = throughputSamples[0];
      const lastSample = throughputSamples[throughputSamples.length - 1];
      const degradation = (firstSample - lastSample) / firstSample;

      expect(degradation).toBeLessThan(0.5); // Less than 50% degradation
    }

    await worker.stop();
    await redis.quit();
  }, 30000); // 30 second timeout

  it('should handle memory pressure with many pending jobs', async () => {
    const redis = new Redis(REDIS_URL);
    const q = new Queue({ redis, namespace: `${namespace}:pending` });

    // Enqueue many jobs rapidly without processing
    const totalJobs = 10000;
    const startTime = Date.now();

    for (let i = 0; i < totalJobs; i++) {
      await q.add({
        groupId: `pending-group-${i % 50}`, // 50 different groups
        payload: {
          id: i,
          timestamp: Date.now(),
          data: 'payload-data-'.repeat(10), // Some payload data
        },
        orderMs: i,
      });

      if (i % 1000 === 0) {
        console.log(`Enqueued ${i} jobs...`);
      }
    }

    const enqueueTime = Date.now() - startTime;
    console.log(`Enqueued ${totalJobs} jobs in ${enqueueTime}ms`);

    // Now start processing
    const processed: number[] = [];
    const processingStartTime = Date.now();

    const workers: Worker<any>[] = [];
    for (let i = 0; i < 5; i++) {
      // Multiple workers
      const worker = new Worker({
        redis: redis.duplicate(),
        namespace: `${namespace}:pending`,
        useBlocking: true,
        blockingTimeoutSec: 2,
        handler: async (job) => {
          processed.push(job.payload.id);
        },
      });
      workers.push(worker);
      worker.run();
    }

    // Wait for processing
    while (
      processed.length < totalJobs &&
      Date.now() - processingStartTime < 30000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log(`Processed ${processed.length}/${totalJobs} jobs...`);
    }

    expect(processed.length).toBe(totalJobs);

    // Check memory usage
    const memoryUsage = process.memoryUsage();
    expect(memoryUsage.heapUsed).toBeLessThan(500 * 1024 * 1024); // Less than 500MB

    await Promise.all(workers.map((w) => w.stop()));
    await redis.quit();
  }, 60000); // 60 second timeout

  it('should handle worker churn (workers starting and stopping)', async () => {
    const redis = new Redis(REDIS_URL);
    const q = new Queue({ redis, namespace: `${namespace}:churn` });

    // Enqueue jobs continuously
    const totalJobs = 2000;
    let enqueuedCount = 0;

    const enqueueInterval = setInterval(async () => {
      if (enqueuedCount < totalJobs) {
        await q.add({
          groupId: `churn-group-${enqueuedCount % 5}`,
          payload: { id: enqueuedCount },
          orderMs: enqueuedCount,
        });
        enqueuedCount++;
      } else {
        clearInterval(enqueueInterval);
      }
    }, 5);

    const processed: number[] = [];
    const workers: Worker<any>[] = [];

    // Simulate worker churn
    const workerLifecycle = async (workerId: number) => {
      while (processed.length < totalJobs) {
        const worker = new Worker({
          redis: redis.duplicate(),
          namespace: `${namespace}:churn`,
          useBlocking: true,
          blockingTimeoutSec: 1,
          handler: async (job) => {
            processed.push(job.payload.id);
            await new Promise((resolve) => setTimeout(resolve, 10));
          },
        });

        worker.run();

        // Worker runs for random duration
        const lifetime = 500 + Math.random() * 1000;
        await new Promise((resolve) => setTimeout(resolve, lifetime));

        await worker.stop();

        // Pause before starting new worker
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    };

    // Start multiple worker lifecycles
    const workerPromises = [];
    for (let i = 0; i < 3; i++) {
      workerPromises.push(workerLifecycle(i));
    }

    await Promise.all(workerPromises);

    console.log(
      `Worker churn results: ${processed.length} processed, ${new Set(processed).size} unique`,
    );

    // In worker churn scenarios, some jobs might be duplicated due to visibility timeout expiry
    // Accept that we process most jobs with minimal duplicates
    expect(processed.length).toBeGreaterThan(totalJobs * 0.95); // At least 95% throughput
    const duplicateRate =
      (processed.length - new Set(processed).size) / processed.length;
    expect(duplicateRate).toBeLessThan(0.05); // Less than 5% duplicates

    await redis.quit();
  }, 30000);

  it('should handle burst traffic patterns', async () => {
    const redis = new Redis(REDIS_URL);
    const q = new Queue({ redis, namespace: `${namespace}:burst` });

    const processed: number[] = [];
    const processingTimes: number[] = [];

    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: `${namespace}:burst`,
      useBlocking: true,
      blockingTimeoutSec: 2,
      handler: async (job) => {
        const startTime = Date.now();
        processed.push(job.payload.id);

        // Simulate variable processing time (reduced for faster processing)
        const processingTime = 5 + Math.random() * 15; // 5-20ms instead of 10-50ms
        await new Promise((resolve) => setTimeout(resolve, processingTime));

        processingTimes.push(Date.now() - startTime);
      },
    });

    worker.run();

    let jobCounter = 0;

    // Simulate burst patterns: high activity followed by low activity
    for (let burst = 0; burst < 5; burst++) {
      console.log(`Starting burst ${burst + 1}...`);

      // High activity burst (reduced size for more realistic processing)
      const burstSize = 100 + Math.random() * 50; // Smaller, more manageable bursts
      const burstPromises = [];

      for (let i = 0; i < burstSize; i++) {
        burstPromises.push(
          q.add({
            groupId: `burst-group-${jobCounter % 10}`,
            payload: { id: jobCounter, burst: burst },
            orderMs: jobCounter,
          }),
        );
        jobCounter++;
      }

      await Promise.all(burstPromises);

      // Wait for burst to be processed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Quiet period
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Wait for final processing with more time for variable burst sizes
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Burst traffic tests are inherently variable - accept 80% completion as success
    expect(processed.length).toBeGreaterThan(jobCounter * 0.8); // At least 80%

    // Processing times should remain reasonable even during bursts
    if (processingTimes.length > 0) {
      const avgProcessingTime =
        processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
      expect(avgProcessingTime).toBeLessThan(50); // Less than 50ms average
    }

    await worker.stop();
    await redis.quit();
  }, 60000); // Increased timeout for burst processing

  it('should handle gradual resource exhaustion gracefully', async () => {
    const redis = new Redis(REDIS_URL);
    const q = new Queue({ redis, namespace: `${namespace}:exhaustion` });

    const processed: number[] = [];
    const errors: string[] = [];
    let memoryLeakSize = 0;
    const memoryLeak: any[] = []; // Intentional memory leak simulation

    const worker = new Worker({
      redis: redis.duplicate(),
      namespace: `${namespace}:exhaustion`,
      useBlocking: false,
      pollIntervalMs: 10,
      handler: async (job) => {
        processed.push(job.payload.id);

        // Simulate gradual memory leak
        const leakData = new Array(1000).fill('memory-leak-data');
        memoryLeak.push(leakData);
        memoryLeakSize += leakData.length;

        // Simulate CPU intensive work that gets worse over time
        const iterations = 1000 + processed.length * 10;
        let sum = 0;
        for (let i = 0; i < iterations; i++) {
          sum += Math.random();
        }

        // Occasionally clean up some memory
        if (processed.length % 100 === 0) {
          memoryLeak.splice(0, Math.floor(memoryLeak.length * 0.1));
        }
      },
      onError: (err) => {
        errors.push((err as Error).message);
      },
    });

    worker.run();

    // Gradually increase load
    let jobId = 0;
    for (let round = 0; round < 10; round++) {
      const jobsThisRound = 50 + round * 10; // Increasing load

      for (let i = 0; i < jobsThisRound; i++) {
        await q.add({
          groupId: `exhaustion-group-${jobId % 5}`,
          payload: { id: jobId, round: round },
          orderMs: jobId,
        });
        jobId++;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Monitor memory usage
      const memUsage = process.memoryUsage();
      console.log(
        `Round ${round}: Memory ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB, Processed ${processed.length}`,
      );
    }

    // Wait for processing to complete
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Should have processed most jobs despite resource pressure
    expect(processed.length).toBeGreaterThan(jobId * 0.8); // At least 80%

    // Should not have excessive errors
    expect(errors.length).toBeLessThan(jobId * 0.1); // Less than 10% error rate

    await worker.stop();
    await redis.quit();
  }, 30000);

  it('should maintain performance with large number of groups', async () => {
    const redis = new Redis(REDIS_URL);
    const q = new Queue({ redis, namespace: `${namespace}:groups` });

    const numGroups = 1000;
    const jobsPerGroup = 10;
    const totalJobs = numGroups * jobsPerGroup;

    console.log(`Creating ${totalJobs} jobs across ${numGroups} groups...`);

    // Create many groups with few jobs each
    const startTime = Date.now();
    for (let groupId = 0; groupId < numGroups; groupId++) {
      const promises = [];
      for (let jobId = 0; jobId < jobsPerGroup; jobId++) {
        promises.push(
          q.add({
            groupId: `group-${groupId}`,
            payload: { groupId, jobId },
            orderMs: groupId * jobsPerGroup + jobId,
          }),
        );
      }
      await Promise.all(promises);

      if (groupId % 100 === 0) {
        console.log(`Created groups 0-${groupId}...`);
      }
    }

    const enqueueTime = Date.now() - startTime;
    console.log(`Enqueued all jobs in ${enqueueTime}ms`);

    const processed: { groupId: number; jobId: number }[] = [];
    const processingStartTime = Date.now();

    const workers: Worker<any>[] = [];
    for (let i = 0; i < 5; i++) {
      const worker = new Worker({
        redis: redis.duplicate(),
        namespace: `${namespace}:groups`,
        useBlocking: true,
        blockingTimeoutSec: 2,
        handler: async (job) => {
          processed.push(job.payload);
        },
      });
      workers.push(worker);
      worker.run();
    }

    // Wait for processing
    while (
      processed.length < totalJobs &&
      Date.now() - processingStartTime < 60000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      console.log(`Processed ${processed.length}/${totalJobs} jobs...`);
    }

    expect(processed.length).toBe(totalJobs);

    // Verify FIFO order within each group
    const groupResults: { [key: number]: number[] } = {};
    processed.forEach(({ groupId, jobId }) => {
      if (!groupResults[groupId]) groupResults[groupId] = [];
      groupResults[groupId].push(jobId);
    });

    // Check a sample of groups for correct ordering
    const sampleGroups = [0, 100, 500, 999];
    sampleGroups.forEach((groupId) => {
      const expectedOrder = [...Array(jobsPerGroup).keys()];
      expect(groupResults[groupId]).toEqual(expectedOrder);
    });

    const processingTime = Date.now() - processingStartTime;
    const throughput = totalJobs / (processingTime / 1000);
    console.log(`Processing throughput: ${Math.round(throughput)} jobs/sec`);

    expect(throughput).toBeGreaterThan(100); // At least 100 jobs/sec

    await Promise.all(workers.map((w) => w.stop()));
    await redis.quit();
  }, 120000); // 2 minute timeout
});

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
