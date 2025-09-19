import Redis from 'ioredis';
import { Queue, Worker } from '../src';
import { Queue as BullMQQueue, Worker as BullMQWorker } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const BENCHMARK_DURATION_MS = 10_000; // 10 seconds

interface BenchmarkResult {
  name: string;
  duration: number;
  jobsEnqueued: number;
  jobsProcessed: number;
  throughputPerSecond: number;
  enqueueRate: number;
  workerCount: number;
}

export async function benchmarkSimpleQueue2Workers(): Promise<BenchmarkResult> {
  console.log('🚀 Starting Simple Queue Benchmark (2 Workers)...');

  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  const namespace = 'benchmark:simple-2w:' + Date.now();

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

  // Two workers sharing the job processing
  const worker1 = new Worker<{ id: number }>({
    redis: redis.duplicate(),
    namespace,
    visibilityTimeoutMs: 30_000,
    pollIntervalMs: 1,
    enableCleanup: false,
    handler: async (job) => {
      jobsProcessed++;
      // Simulate minimal work
      await new Promise((resolve) => setImmediate(resolve));
    },
    onError: (err) => console.error('Worker 1 error:', err),
  });

  const worker2 = new Worker<{ id: number }>({
    redis: redis.duplicate(),
    namespace,
    visibilityTimeoutMs: 30_000,
    pollIntervalMs: 1,
    enableCleanup: false,
    handler: async (job) => {
      jobsProcessed++;
      // Simulate minimal work
      await new Promise((resolve) => setImmediate(resolve));
    },
    onError: (err) => console.error('Worker 2 error:', err),
  });

  worker1.run();
  worker2.run();

  // Producer: Enqueue jobs as fast as possible
  const producer = async () => {
    while (Date.now() - startTime < BENCHMARK_DURATION_MS) {
      try {
        await queue.add({
          groupId: `group-${jobsEnqueued % 5}`, // 5 groups for testing
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

  // Give time for remaining jobs to process
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Stop workers
  await Promise.all([worker1.stop(), worker2.stop()]);

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
    workerCount: 2,
  };

  console.log('✅ Simple Queue (2 Workers) Results:');
  console.log(`   Duration: ${actualDuration}ms`);
  console.log(`   Jobs Enqueued: ${jobsEnqueued}`);
  console.log(`   Jobs Processed: ${jobsProcessed}`);
  console.log(`   Throughput: ${results.throughputPerSecond} jobs/sec`);
  console.log(`   Enqueue Rate: ${results.enqueueRate} jobs/sec`);

  return results;
}

export async function benchmarkBullMQ2Workers(): Promise<BenchmarkResult> {
  console.log('🐂 Starting BullMQ Benchmark (2 Workers)...');

  const connection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  const queueName = 'benchmark-bullmq-2w-' + Date.now();

  let jobsProcessed = 0;
  let jobsEnqueued = 0;
  const startTime = Date.now();

  // Single queue with two workers
  const queue = new BullMQQueue(queueName, {
    connection: connection.duplicate(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  });

  const worker1 = new BullMQWorker(
    queueName,
    async (job) => {
      jobsProcessed++;
      // Simulate minimal work
      await new Promise((resolve) => setImmediate(resolve));
    },
    {
      connection: connection.duplicate(),
      concurrency: 1,
    },
  );

  const worker2 = new BullMQWorker(
    queueName,
    async (job) => {
      jobsProcessed++;
      // Simulate minimal work
      await new Promise((resolve) => setImmediate(resolve));
    },
    {
      connection: connection.duplicate(),
      concurrency: 1,
    },
  );

  worker1.on('error', (err) => console.error('Worker 1 error:', err));
  worker2.on('error', (err) => console.error('Worker 2 error:', err));

  // Producer: Enqueue jobs as fast as possible
  const producer = async () => {
    while (Date.now() - startTime < BENCHMARK_DURATION_MS) {
      try {
        await queue.add('benchmark-job', {
          id: jobsEnqueued,
          groupId: `group-${jobsEnqueued % 5}`, // 5 groups for testing
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

  // Give time for remaining jobs to process
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Stop workers and cleanup
  await Promise.all([worker1.close(), worker2.close()]);
  await queue.obliterate({ force: true });

  const endTime = Date.now();
  const actualDuration = endTime - startTime;

  await connection.quit();

  const results = {
    name: 'BullMQ',
    duration: actualDuration,
    jobsEnqueued,
    jobsProcessed,
    throughputPerSecond: Math.round(jobsProcessed / (actualDuration / 1000)),
    enqueueRate: Math.round(jobsEnqueued / (actualDuration / 1000)),
    workerCount: 2,
  };

  console.log('✅ BullMQ (2 Workers) Results:');
  console.log(`   Duration: ${actualDuration}ms`);
  console.log(`   Jobs Enqueued: ${jobsEnqueued}`);
  console.log(`   Jobs Processed: ${jobsProcessed}`);
  console.log(`   Throughput: ${results.throughputPerSecond} jobs/sec`);
  console.log(`   Enqueue Rate: ${results.enqueueRate} jobs/sec`);

  return results;
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    console.log('🏁 Starting Fair 2v2 Worker Benchmark...\n');

    const simpleQueueResult = await benchmarkSimpleQueue2Workers();
    console.log('\n' + '-'.repeat(40) + '\n');

    const bullmqResult = await benchmarkBullMQ2Workers();

    console.log('\n' + '='.repeat(60));
    console.log('📊 2v2 WORKER COMPARISON');
    console.log('='.repeat(60));
    console.log(
      `Simple Queue: ${simpleQueueResult.throughputPerSecond} jobs/sec`,
    );
    console.log(`BullMQ:       ${bullmqResult.throughputPerSecond} jobs/sec`);

    const ratio =
      simpleQueueResult.throughputPerSecond / bullmqResult.throughputPerSecond;
    console.log(
      `🏆 Simple Queue is ${ratio.toFixed(2)}x faster with 2 workers each!`,
    );

    process.exit(0);
  })().catch((err) => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
}
