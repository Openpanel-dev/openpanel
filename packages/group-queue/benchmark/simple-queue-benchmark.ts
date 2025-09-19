import Redis from 'ioredis';
import { Queue, Worker } from '../src';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const BENCHMARK_DURATION_MS = 10_000; // 10 seconds

export async function benchmarkSimpleQueue() {
  console.log('🚀 Starting Simple Queue Benchmark...');

  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  const namespace = 'benchmark:simple:' + Date.now();

  // Cleanup any existing keys
  const existingKeys = await redis.keys(`${namespace}*`);
  if (existingKeys.length > 0) {
    await redis.del(existingKeys);
  }

  const queue = new Queue({
    redis,
    namespace,
    visibilityTimeoutMs: 30_000,
  });

  let jobsProcessed = 0;
  let jobsEnqueued = 0;
  const startTime = Date.now();

  // Worker to process jobs
  const worker = new Worker<{ id: number }>({
    redis,
    namespace,
    visibilityTimeoutMs: 30_000,
    pollIntervalMs: 100, // Very fast polling for benchmark
    enableCleanup: true, // Disable cleanup during benchmark for pure throughput
    handler: async (job) => {
      jobsProcessed++;
      // Simulate minimal work
      await new Promise((resolve) => setImmediate(resolve));
    },
    onError: (err) => console.error('Worker error:', err),
  });

  worker.run();

  // Producer: Enqueue jobs as fast as possible
  const producer = async () => {
    while (Date.now() - startTime < BENCHMARK_DURATION_MS) {
      try {
        await queue.add({
          groupId: `group-${jobsEnqueued % 10}`, // 10 different groups for parallelism
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

  // Stop worker
  await worker.close();

  const endTime = Date.now();
  const actualDuration = endTime - startTime;

  // Cleanup
  const keys = await redis.keys(`${namespace}*`);
  if (keys.length > 0) {
    await redis.del(keys);
  }
  await redis.quit();

  const results = {
    name: 'Simple Queue',
    duration: actualDuration,
    jobsEnqueued,
    jobsProcessed,
    throughputPerSecond: Math.round(jobsProcessed / (actualDuration / 1000)),
    enqueueRate: Math.round(jobsEnqueued / (actualDuration / 1000)),
  };

  console.log('✅ Simple Queue Results:');
  console.log(`   Duration: ${actualDuration}ms`);
  console.log(`   Jobs Enqueued: ${jobsEnqueued}`);
  console.log(`   Jobs Processed: ${jobsProcessed}`);
  console.log(`   Throughput: ${results.throughputPerSecond} jobs/sec`);
  console.log(`   Enqueue Rate: ${results.enqueueRate} jobs/sec`);

  return results;
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  benchmarkSimpleQueue()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Benchmark failed:', err);
      process.exit(1);
    });
}
