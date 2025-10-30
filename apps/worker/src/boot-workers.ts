import type { Queue, WorkerOptions } from 'bullmq';
import { Worker } from 'bullmq';

import {
  EVENTS_GROUP_QUEUES_SHARDS,
  type EventsQueuePayloadIncomingEvent,
  cronQueue,
  eventsGroupQueues,
  miscQueue,
  notificationQueue,
  queueLogger,
  sessionsQueue,
} from '@openpanel/queue';
import { getLock, getRedisQueue } from '@openpanel/redis';

import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { Worker as GroupWorker } from 'groupmq';

import { cronJob } from './jobs/cron';
import { incomingEventPure } from './jobs/events.incoming-event';
import { miscJob } from './jobs/misc';
import { notificationJob } from './jobs/notification';
import { sessionsJob } from './jobs/sessions';
import { eventsGroupJobDuration } from './metrics';
import { logger } from './utils/logger';
import { requireSingleton } from './utils/singleton-lock';

const workerOptions: WorkerOptions = {
  connection: getRedisQueue(),
};

type QueueName = string; // Can be: events, events_N (where N is 0 to shards-1), sessions, cron, notification, misc

/**
 * Parses the ENABLED_QUEUES environment variable and returns an array of queue names to start.
 * If no env var is provided, returns all queues.
 *
 * Supported queue names:
 * - events - All event shards (events_0, events_1, ..., events_N)
 * - events_N - Individual event shard (where N is 0 to EVENTS_GROUP_QUEUES_SHARDS-1)
 * - sessions, cron, notification, misc
 */
function getEnabledQueues(): QueueName[] {
  const enabledQueuesEnv = process.env.ENABLED_QUEUES?.trim();

  if (!enabledQueuesEnv) {
    logger.info('No ENABLED_QUEUES specified, starting all queues', {
      totalEventShards: EVENTS_GROUP_QUEUES_SHARDS,
    });
    return ['events', 'sessions', 'cron', 'notification', 'misc'];
  }

  const queues = enabledQueuesEnv
    .split(',')
    .map((q) => q.trim())
    .filter(Boolean);

  logger.info('Starting queues from ENABLED_QUEUES', {
    queues,
    totalEventShards: EVENTS_GROUP_QUEUES_SHARDS,
  });
  return queues;
}

/**
 * Gets the concurrency setting for a queue from environment variables.
 * Env var format: {QUEUE_NAME}_CONCURRENCY (e.g., EVENTS_0_CONCURRENCY=32)
 */
function getConcurrencyFor(queueName: string, defaultValue = 1): number {
  const envKey = `${queueName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_CONCURRENCY`;
  const value = process.env[envKey];

  if (value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return defaultValue;
}

export async function bootWorkers() {
  const enabledQueues = getEnabledQueues();
  const enforceSingleton = process.env.ENFORCE_SINGLETON === '1';
  let singletonCleanup: (() => void) | null = null;

  // Enforce singleton lock if requested
  if (enforceSingleton) {
    const lockKey = enabledQueues.join(',');
    logger.info('Enforcing singleton mode', { lockKey });
    singletonCleanup = await requireSingleton(lockKey);
  }

  const workers: (Worker | GroupWorker<any>)[] = [];

  // Start event workers based on enabled queues
  const eventQueuesToStart: number[] = [];

  if (enabledQueues.includes('events')) {
    // Start all event shards
    for (let i = 0; i < EVENTS_GROUP_QUEUES_SHARDS; i++) {
      eventQueuesToStart.push(i);
    }
  } else {
    // Start specific event shards (events_0, events_1, etc.)
    for (let i = 0; i < EVENTS_GROUP_QUEUES_SHARDS; i++) {
      if (enabledQueues.includes(`events_${i}`)) {
        eventQueuesToStart.push(i);
      }
    }
  }

  for (const index of eventQueuesToStart) {
    const queue = eventsGroupQueues[index];
    if (!queue) continue;

    const queueName = `events_${index}`;
    const concurrency = getConcurrencyFor(
      queueName,
      Number.parseInt(process.env.EVENT_JOB_CONCURRENCY || '10', 10),
    );

    const worker = new GroupWorker<EventsQueuePayloadIncomingEvent['payload']>({
      queue,
      concurrency,
      logger: queueLogger,
      blockingTimeoutSec: Number.parseFloat(
        process.env.EVENT_BLOCKING_TIMEOUT_SEC || '1',
      ),
      handler: async (job) => {
        if (await getLock(job.id, '1', 10000)) {
          logger.info('worker handler', {
            jobId: job.id,
            groupId: job.groupId,
            timestamp: job.data.event.timestamp,
            data: job.data,
          });
        } else {
          logger.info('event already processed', {
            jobId: job.id,
            groupId: job.groupId,
            timestamp: job.data.event.timestamp,
            data: job.data,
          });
        }
        await incomingEventPure(job.data);
      },
    });

    worker.run();
    workers.push(worker);
    logger.info(`Started worker for ${queueName}`, { concurrency });
  }

  // Start sessions worker
  if (enabledQueues.includes('sessions')) {
    const concurrency = getConcurrencyFor('sessions');
    const sessionsWorker = new Worker(sessionsQueue.name, sessionsJob, {
      ...workerOptions,
      concurrency,
    });
    workers.push(sessionsWorker);
    logger.info('Started worker for sessions', { concurrency });
  }

  // Start cron worker
  if (enabledQueues.includes('cron')) {
    const concurrency = getConcurrencyFor('cron');
    const cronWorker = new Worker(cronQueue.name, cronJob, {
      ...workerOptions,
      concurrency,
    });
    workers.push(cronWorker);
    logger.info('Started worker for cron', { concurrency });
  }

  // Start notification worker
  if (enabledQueues.includes('notification')) {
    const concurrency = getConcurrencyFor('notification');
    const notificationWorker = new Worker(
      notificationQueue.name,
      notificationJob,
      { ...workerOptions, concurrency },
    );
    workers.push(notificationWorker);
    logger.info('Started worker for notification', { concurrency });
  }

  // Start misc worker
  if (enabledQueues.includes('misc')) {
    const concurrency = getConcurrencyFor('misc');
    const miscWorker = new Worker(miscQueue.name, miscJob, {
      ...workerOptions,
      concurrency,
    });
    workers.push(miscWorker);
    logger.info('Started worker for misc', { concurrency });
  }

  if (workers.length === 0) {
    logger.warn(
      'No workers started. Check ENABLED_QUEUES environment variable.',
    );
  }

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
        if (job.processedOn && job.finishedOn) {
          const duration = job.finishedOn - job.processedOn;
          eventsGroupJobDuration.observe(
            { queue_shard: worker.name, status: 'failed' },
            duration,
          );
        }
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
        if (job.processedOn && job.finishedOn) {
          const duration = job.finishedOn - job.processedOn;
          eventsGroupJobDuration.observe(
            { queue_shard: worker.name, status: 'success' },
            duration,
          );
        }
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

      // Wait for cron queue to empty if it's running
      if (enabledQueues.includes('cron')) {
        await waitForQueueToEmpty(cronQueue);
      }

      await Promise.all(workers.map((worker) => worker.close()));

      // Release singleton lock if acquired
      if (singletonCleanup) {
        singletonCleanup();
      }

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
