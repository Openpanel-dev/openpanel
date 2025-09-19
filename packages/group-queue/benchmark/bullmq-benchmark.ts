import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const BENCHMARK_DURATION_MS = 10_000; // 10 seconds

export async function benchmarkBullMQ() {
  console.log('🐂 Starting BullMQ Benchmark...');

  const connection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  const queueName = 'benchmark-bullmq-' + Date.now();

  // Create multiple queues to simulate grouping (BullMQ doesn't have built-in grouping)
  const queues: Queue[] = [];
  const workers: Worker[] = [];
  const queueEvents: QueueEvents[] = [];

  let jobsProcessed = 0;
  let jobsEnqueued = 0;
  const startTime = Date.now();

  // Create 10 queues to simulate the 10 groups we use in simple-queue
  for (let i = 0; i < 10; i++) {
    const queue = new Queue(`${queueName}-${i}`, {
      connection: connection.duplicate(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    const worker = new Worker(
      `${queueName}-${i}`,
      async (job) => {
        jobsProcessed++;
        // Simulate minimal work
        await new Promise((resolve) => setImmediate(resolve));
      },
      {
        connection: connection.duplicate(),
        concurrency: 1, // Match simple-queue behavior (one job per group at a time)
      },
    );

    worker.on('error', (err) => console.error('Worker error:', err));

    const events = new QueueEvents(`${queueName}-${i}`, {
      connection: connection.duplicate(),
    });

    queues.push(queue);
    workers.push(worker);
    queueEvents.push(events);
  }

  // Producer: Enqueue jobs as fast as possible
  const producer = async () => {
    while (Date.now() - startTime < BENCHMARK_DURATION_MS) {
      try {
        const queueIndex = jobsEnqueued % 10;
        await queues[queueIndex].add('benchmark-job', { id: jobsEnqueued });
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

  // Stop workers and cleanup
  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.all(queueEvents.map((events) => events.close()));
  await Promise.all(queues.map((queue) => queue.obliterate({ force: true })));

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
  };

  console.log('✅ BullMQ Results:');
  console.log(`   Duration: ${actualDuration}ms`);
  console.log(`   Jobs Enqueued: ${jobsEnqueued}`);
  console.log(`   Jobs Processed: ${jobsProcessed}`);
  console.log(`   Throughput: ${results.throughputPerSecond} jobs/sec`);
  console.log(`   Enqueue Rate: ${results.enqueueRate} jobs/sec`);

  return results;
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  benchmarkBullMQ()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Benchmark failed:', err);
      process.exit(1);
    });
}
