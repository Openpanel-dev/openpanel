import type { Queue, WorkerOptions } from 'bullmq';
import { Worker } from 'bullmq';

import {
  type EventsQueuePayloadIncomingEvent,
  cronQueue,
  eventsQueue,
  miscQueue,
  notificationQueue,
  sessionsQueue,
} from '@openpanel/queue';
import { getRedisGroupQueue, getRedisQueue } from '@openpanel/redis';

import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { Worker as GroupWorker } from '@openpanel/group-queue';

import { cronJob } from './jobs/cron';
import { eventsJob } from './jobs/events';
import { incomingEventPure } from './jobs/events.incoming-event';
import { miscJob } from './jobs/misc';
import { notificationJob } from './jobs/notification';
import { sessionsJob } from './jobs/sessions';
import { logger } from './utils/logger';

const workerOptions: WorkerOptions = {
  connection: getRedisQueue(),
  concurrency: Number.parseInt(process.env.CONCURRENCY || '1', 10),
};

export async function bootWorkers() {
  const eventsGroupWorker = new GroupWorker<
    EventsQueuePayloadIncomingEvent['payload']
  >({
    redis: getRedisGroupQueue(),
    handler: async (job) => {
      await incomingEventPure(job.payload);
    },
    namespace: 'events',
    jobTimeoutMs: 30_000,
    enableCleanup: true,
    orderingDelayMs: 2_000,
  });
  eventsGroupWorker.run();
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
    eventsGroupWorker,
  ];

  workers.forEach((worker) => {
    (worker as Worker).on('error', (error) => {
      logger.error('worker error', {
        worker: worker.name,
        error,
      });
    });

    (worker as Worker).on('closed', () => {
      logger.info('worker closed', {
        worker: worker.name,
      });
    });

    (worker as Worker).on('ready', () => {
      logger.info('worker ready', {
        worker: worker.name,
      });
    });

    (worker as Worker).on('failed', (job) => {
      if (job) {
        logger.error('job failed', {
          worker: worker.name,
          data: job.data,
          error: job.failedReason,
          options: job.opts,
        });
      }
    });

    (worker as Worker).on('completed', (job) => {
      if (job) {
        // logger.info('job completed', {
        //   worker: worker.name,
        //   data: job.data,
        //   elapsed:
        //     job.processedOn && job.finishedOn
        //       ? job.finishedOn - job.processedOn
        //       : undefined,
        // });
        // Calculate elapsed time in milliseconds
        // processedOn and finishedOn are now in milliseconds (performance.now() format)
        const elapsedMs =
          job.processedOn && job.finishedOn
            ? Math.round(job.finishedOn - job.processedOn)
            : undefined;

        console.log(
          'job completed',
          job.id,
          elapsedMs ? `${elapsedMs}ms` : 'unknown',
        );
      }
    });

    (worker as Worker).on('ioredis:close', () => {
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
