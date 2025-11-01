import type { Queue, WorkerOptions } from 'bullmq';
import { Worker } from 'bullmq';

import {
  type EventsQueuePayloadIncomingEvent,
  cronQueue,
  eventsGroupQueue,
  importQueue,
  miscQueue,
  notificationQueue,
  queueLogger,
  sessionsQueue,
} from '@openpanel/queue';
import { getRedisQueue } from '@openpanel/redis';

import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { Worker as GroupWorker } from 'groupmq';

import { cronJob } from './jobs/cron';
import { eventsJob } from './jobs/events';
import { incomingEventPure } from './jobs/events.incoming-event';
import { importJob } from './jobs/import';
import { miscJob } from './jobs/misc';
import { notificationJob } from './jobs/notification';
import { sessionsJob } from './jobs/sessions';
import { logger } from './utils/logger';

const workerOptions: WorkerOptions = {
  connection: getRedisQueue(),
};

export async function bootWorkers() {
  const eventsGroupWorker = new GroupWorker<
    EventsQueuePayloadIncomingEvent['payload']
  >({
    concurrency: Number.parseInt(process.env.EVENT_JOB_CONCURRENCY || '1', 10),
    logger: queueLogger,
    queue: eventsGroupQueue,
    handler: async (job) => {
      logger.info('processing event (group queue)', {
        groupId: job.groupId,
        timestamp: job.data.event.timestamp,
      });
      await incomingEventPure(job.data);
    },
  });
  eventsGroupWorker.run();
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
  const importWorker = new Worker(importQueue.name, importJob, {
    ...workerOptions,
    concurrency: Number.parseInt(process.env.IMPORT_JOB_CONCURRENCY || '1', 10),
  });

  const workers = [
    sessionsWorker,
    cronWorker,
    notificationWorker,
    miscWorker,
    importWorker,
    // eventsGroupWorker,
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
          jobId: job.id,
          worker: worker.name,
          data: job.data,
          error: job.failedReason,
          options: job.opts,
        });
      }
    });

    (worker as Worker).on('completed', (job) => {
      if (job) {
        logger.info('job completed', {
          jobId: job.id,
          worker: worker.name,
          data: job.data,
          elapsed:
            job.processedOn && job.finishedOn
              ? job.finishedOn - job.processedOn
              : undefined,
        });
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
        if (process.env.NODE_ENV === 'production') {
          exitHandler(evt, code);
        } else {
          logger.info('Shutting down for development', {
            event: evt,
            code,
          });
          process.exit(0);
        }
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
