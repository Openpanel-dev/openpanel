import Redis from 'ioredis';
import { Queue, Worker, setupGracefulShutdown, getWorkersStatus } from '../src';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

async function main() {
  console.log('🚀 Starting graceful shutdown example...');

  // Create Redis connection with production settings
  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    connectTimeout: 10_000,
    commandTimeout: 5_000,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  const namespace = 'example:graceful:' + Date.now();

  // Create queue
  const queue = new Queue({
    redis,
    namespace,
    visibilityTimeoutMs: 30_000,
  });

  // Create multiple workers
  const workers = [
    new Worker({
      redis: redis.duplicate(),
      namespace,
      handler: async (job) => {
        console.log(
          `Worker 1 processing job ${job.id} from group ${job.groupId}`,
        );
        // Simulate work that takes some time
        await new Promise((resolve) => setTimeout(resolve, 5000));
        console.log(`Worker 1 completed job ${job.id}`);
      },
      onError: (err, job) => {
        console.error('Worker 1 error:', err, job?.id);
      },
    }),
    new Worker({
      redis: redis.duplicate(),
      namespace,
      handler: async (job) => {
        console.log(
          `Worker 2 processing job ${job.id} from group ${job.groupId}`,
        );
        // Simulate work that takes some time
        await new Promise((resolve) => setTimeout(resolve, 3000));
        console.log(`Worker 2 completed job ${job.id}`);
      },
      onError: (err, job) => {
        console.error('Worker 2 error:', err, job?.id);
      },
    }),
  ];

  // Set up graceful shutdown (similar to your BullMQ pattern)
  await setupGracefulShutdown(workers, [queue], {
    queueEmptyTimeoutMs: 30_000,
    workerStopTimeoutMs: 30_000,
    enableLogging: true,
    logger: (message, data) => {
      console.log(`[SHUTDOWN] ${message}`, data || '');
    },
  });

  // Start workers
  workers.forEach((worker) => worker.run());

  // Add some jobs
  console.log('Adding jobs to queue...');
  for (let i = 1; i <= 10; i++) {
    await queue.add({
      groupId: `group-${i % 3}`, // 3 different groups
      payload: {
        id: i,
        message: `Hello from job ${i}`,
        timestamp: Date.now(),
      },
    });
  }

  console.log('Jobs added. Workers are processing...');

  // Monitor status periodically
  const statusInterval = setInterval(() => {
    const status = getWorkersStatus(workers);
    console.log('\n📊 Workers Status:', {
      total: status.total,
      processing: status.processing,
      idle: status.idle,
    });

    if (status.processing > 0) {
      status.workers.forEach((worker) => {
        if (worker.currentJob) {
          console.log(
            `  Worker ${worker.index}: Processing job ${worker.currentJob.jobId} (${worker.currentJob.processingTimeMs}ms)`,
          );
        }
      });
    }

    queue.getActiveCount().then((activeCount) => {
      console.log(`📈 Active jobs in queue: ${activeCount}`);
    });
  }, 2000);

  // Simulate shutdown after 15 seconds
  setTimeout(async () => {
    console.log('\n🛑 Simulating shutdown signal (SIGTERM)...');
    clearInterval(statusInterval);
    process.kill(process.pid, 'SIGTERM');
  }, 15000);

  console.log(
    '\n💡 Try stopping with Ctrl+C to see graceful shutdown in action!',
  );
  console.log('   - Workers will finish their current jobs');
  console.log('   - Queue will wait to empty');
  console.log('   - Then process will exit cleanly\n');
}

main().catch(console.error);
