import type { Queue, WorkerOptions } from 'bullmq';
import { Worker } from 'bullmq';

import {
  cronQueue,
  eventsQueue,
  miscQueue,
  notificationQueue,
  sessionsQueue,
} from '@openpanel/queue';
import { getRedisQueue } from '@openpanel/redis';

import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { cronJob } from './jobs/cron';
import { eventsJob } from './jobs/events';
import { miscJob } from './jobs/misc';
import { notificationJob } from './jobs/notification';
import { sessionsJob } from './jobs/sessions';
import { logger } from './utils/logger';

const workerOptions: WorkerOptions = {
  connection: getRedisQueue(),
  concurrency: Number.parseInt(process.env.CONCURRENCY || '1', 10),
};

export async function bootWorkers() {
  const eventsWorker = new Worker(eventsQueue.name, eventsJob, workerOptions);
  const sessionsWorker = new Worker(
    sessionsQueue.name,
    sessionsJob,
    workerOptions,
  );
  const cronWorker = new Worker(cronQueue.name, cronJob, workerOptions);
  const notificationWorker = new Worker(
    notificationQueue.name,
    notificationJob,
    workerOptions,
  );
  const miscWorker = new Worker(miscQueue.name, miscJob, workerOptions);

  const workers = [
    sessionsWorker,
    eventsWorker,
    cronWorker,
    notificationWorker,
    miscWorker,
  ];

  workers.forEach((worker) => {
    worker.on('error', (error) => {
      logger.error('worker error', {
        worker: worker.name,
        error,
      });
    });

    worker.on('closed', () => {
      logger.info('worker closed', {
        worker: worker.name,
      });
    });

    worker.on('ready', () => {
      logger.info('worker ready', {
        worker: worker.name,
      });
    });

    worker.on('failed', (job) => {
      if (job) {
        logger.error('job failed', {
          worker: worker.name,
          data: job.data,
          error: job.failedReason,
          options: job.opts,
        });
      }
    });

    worker.on('completed', (job) => {
      if (job) {
        logger.info('job completed', {
          worker: worker.name,
          data: job.data,
          elapsed:
            job.processedOn && job.finishedOn
              ? job.finishedOn - job.processedOn
              : undefined,
        });
      }
    });

    worker.on('ioredis:close', () => {
      logger.error('worker closed due to ioredis:close', {
        worker: worker.name,
      });
    });
  });

  async function exitHandler(
    eventName: string,
    evtOrExitCodeOrError: number | string | Error,
  ) {
    logger.info('Starting graceful shutdown', {
      code: evtOrExitCodeOrError,
      eventName,
    });
    try {
      const time = performance.now();
      await waitForQueueToEmpty(cronQueue);
      await Promise.all(workers.map((worker) => worker.close()));
      logger.info('workers closed successfully', {
        elapsed: performance.now() - time,
      });
    } catch (e) {
      logger.error('exit handler error', {
        code: evtOrExitCodeOrError,
        error: e,
      });
    }
    const exitCode = Number.isNaN(+evtOrExitCodeOrError)
      ? 1
      : +evtOrExitCodeOrError;
    process.exit(exitCode);
  }

  ['uncaughtException', 'unhandledRejection', 'SIGTERM', 'SIGINT'].forEach(
    (evt) => {
      process.on(evt, (code) => {
        exitHandler(evt, code);
      });
    },
  );

  return workers;
}

export async function waitForQueueToEmpty(queue: Queue, timeout = 60_000) {
  const startTime = performance.now();

  while (true) {
    const activeCount = await queue.getActiveCount();

    if (activeCount === 0) {
      break;
    }

    if (performance.now() - startTime > timeout) {
      logger.warn('Timeout reached while waiting for queue to empty', {
        queue: queue.name,
        remainingCount: activeCount,
      });
      break;
    }

    logger.info('Waiting for queue to finish', {
      queue: queue.name,
      count: activeCount,
    });
    await sleep(500);
  }
}
