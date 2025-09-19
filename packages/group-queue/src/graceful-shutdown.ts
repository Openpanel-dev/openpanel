import type { Queue, Worker } from './index';

export interface GracefulShutdownOptions {
  /** Maximum time to wait for queues to empty (default: 30 seconds) */
  queueEmptyTimeoutMs?: number;
  /** Maximum time to wait for workers to stop gracefully (default: 30 seconds) */
  workerStopTimeoutMs?: number;
  /** Whether to log shutdown progress (default: true) */
  enableLogging?: boolean;
  /** Custom logger function */
  logger?: (message: string, data?: any) => void;
}

/**
 * Sets up graceful shutdown handlers for workers and queues
 * Similar to BullMQ's graceful shutdown pattern
 */
export async function setupGracefulShutdown(
  workers: Worker[],
  queues: Queue[] = [],
  options: GracefulShutdownOptions = {},
): Promise<void> {
  const {
    queueEmptyTimeoutMs = 30_000,
    workerStopTimeoutMs = 30_000,
    enableLogging = true,
    logger = console.log,
  } = options;

  const log = enableLogging ? logger : () => {};

  async function exitHandler(
    eventName: string,
    evtOrExitCodeOrError: number | string | Error,
  ) {
    const startTime = Date.now();

    log('Starting graceful shutdown', {
      event: eventName,
      code: evtOrExitCodeOrError,
      workersCount: workers.length,
      queuesCount: queues.length,
    });

    try {
      // Step 1: Wait for queues to empty (optional)
      if (queues.length > 0) {
        log('Waiting for queues to empty...');
        await Promise.race([
          Promise.all(
            queues.map((queue) => queue.waitForEmpty(queueEmptyTimeoutMs)),
          ),
          sleep(queueEmptyTimeoutMs),
        ]);
      }

      // Step 2: Stop all workers gracefully
      log('Stopping workers gracefully...');
      await Promise.all(
        workers.map(async (worker, index) => {
          try {
            await worker.stop(workerStopTimeoutMs);
            log(`Worker ${index} stopped successfully`);
          } catch (err) {
            log(`Worker ${index} failed to stop gracefully:`, err);
          }
        }),
      );

      const elapsed = Date.now() - startTime;
      log('Graceful shutdown completed successfully', { elapsed });
    } catch (error) {
      const elapsed = Date.now() - startTime;
      log('Error during graceful shutdown:', { error, elapsed });
    }

    // Determine exit code
    const exitCode =
      typeof evtOrExitCodeOrError === 'number' ? evtOrExitCodeOrError : 1;

    process.exit(exitCode);
  }

  // Register signal handlers
  const signals = [
    'SIGTERM',
    'SIGINT',
    'uncaughtException',
    'unhandledRejection',
  ] as const;

  signals.forEach((signal) => {
    process.on(signal, (codeOrError) => {
      exitHandler(signal, codeOrError);
    });
  });

  log('Graceful shutdown handlers registered', { signals });
}

/**
 * Wait for a queue to become empty
 * @param queue The queue to monitor
 * @param timeoutMs Maximum time to wait (default: 60 seconds)
 * @returns Promise that resolves when queue is empty or timeout is reached
 */
export async function waitForQueueToEmpty(
  queue: Queue,
  timeoutMs = 60_000,
): Promise<boolean> {
  return queue.waitForEmpty(timeoutMs);
}

/**
 * Get status of all workers
 */
export function getWorkersStatus<T = any>(
  workers: Worker<T>[],
): {
  total: number;
  processing: number;
  idle: number;
  workers: Array<{
    index: number;
    isProcessing: boolean;
    currentJob?: {
      jobId: string;
      groupId: string;
      processingTimeMs: number;
    };
  }>;
} {
  const workersStatus = workers.map((worker, index) => {
    const currentJob = worker.getCurrentJob();
    return {
      index,
      isProcessing: worker.isProcessing(),
      currentJob: currentJob
        ? {
            jobId: currentJob.job.id,
            groupId: currentJob.job.groupId,
            processingTimeMs: currentJob.processingTimeMs,
          }
        : undefined,
    };
  });

  const processing = workersStatus.filter((w) => w.isProcessing).length;
  const idle = workersStatus.length - processing;

  return {
    total: workers.length,
    processing,
    idle,
    workers: workersStatus,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
