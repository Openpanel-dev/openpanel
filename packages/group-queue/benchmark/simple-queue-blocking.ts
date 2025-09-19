import Redis from 'ioredis';
import { Queue, Worker } from '../src';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const BENCHMARK_DURATION_MS = 10_000; // 10 seconds
const WORKER_COUNT = 4; // Multiple workers for better throughput

export async function benchmarkSimpleQueueBlocking() {
  console.log('🚀 Starting Simple Queue Blocking Benchmark...');

  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  const namespace = 'benchmark:simple-blocking:' + Date.now();

  // Cleanup any existing keys
  const existingKeys = await redis.keys(`${namespace}*`);
  if (existingKeys.length > 0) {
    await redis.del(existingKeys);
  }

  const queue = new Queue({
    redis,
    namespace,
    visibilityTimeoutMs: 30_000,
    reserveScanLimit: 50, // Scan more groups for better parallelism
  });

  let jobsProcessed = 0;
  let jobsEnqueued = 0;
  const startTime = Date.now();

  // Create multiple workers with blocking enabled
  const workers: Worker<{ id: number }>[] = [];

  for (let i = 0; i < WORKER_COUNT; i++) {
    const worker = new Worker<{ id: number }>({
      redis: redis.duplicate(),
      namespace,
      visibilityTimeoutMs: 30_000,
      useBlocking: true, // Enable blocking reserve
      blockingTimeoutSec: 1, // Short timeout for benchmark
      enableCleanup: i === 0, // Only one worker does cleanup
      cleanupIntervalMs: 30_000, // Less frequent cleanup
      handler: async (job) => {
        jobsProcessed++;
        // Simulate minimal work
        await new Promise((resolve) => setImmediate(resolve));
      },
      onError: (err) => console.error(`Worker ${i} error:`, err),
    });

    workers.push(worker);
    worker.run();
  }

  // Producer: Enqueue jobs as fast as possible
  const producer = async () => {
    while (Date.now() - startTime < BENCHMARK_DURATION_MS) {
      try {
        // Use more groups for better parallelism
        await queue.add({
          groupId: `group-${jobsEnqueued % 20}`, // 20 different groups
          payload: { id: jobsEnqueued },
          orderMs: Date.now(),
        });
        jobsEnqueued++;
      } catch (err) {
        console.error('Enqueue error:', err);
      }
    }
  };

  // Start producer
  const producerPromise = producer();

  // Wait for benchmark duration
  await new Promise((resolve) => setTimeout(resolve, BENCHMARK_DURATION_MS));

  // Stop producer
  await producerPromise;

  // Give a bit more time for remaining jobs to process
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Stop workers
  await Promise.all(workers.map((worker) => worker.close()));

  const endTime = Date.now();
  const actualDuration = endTime - startTime;

  // Cleanup
  const keys = await redis.keys(`${namespace}*`);
  if (keys.length > 0) {
    await redis.del(keys);
  }
  await redis.quit();

  // Close worker connections
  await Promise.all(
    workers.map((worker) => {
      // @ts-ignore - access private redis connection
      return worker.q?.r?.quit();
    }),
  );

  const results = {
    name: 'Simple Queue (Blocking)',
    duration: actualDuration,
    jobsEnqueued,
    jobsProcessed,
    throughputPerSecond: Math.round(jobsProcessed / (actualDuration / 1000)),
    enqueueRate: Math.round(jobsEnqueued / (actualDuration / 1000)),
    workerCount: WORKER_COUNT,
  };

  console.log('✅ Blocking Simple Queue Results:');
  console.log(`   Duration: ${actualDuration}ms`);
  console.log(`   Workers: ${WORKER_COUNT}`);
  console.log(`   Jobs Enqueued: ${jobsEnqueued}`);
  console.log(`   Jobs Processed: ${jobsProcessed}`);
  console.log(`   Throughput: ${results.throughputPerSecond} jobs/sec`);
  console.log(`   Enqueue Rate: ${results.enqueueRate} jobs/sec`);

  return results;
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  benchmarkSimpleQueueBlocking()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Benchmark failed:', err);
      process.exit(1);
    });
}
