import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  cohortComputeQueue,
  cronQueue,
  EVENTS_GROUP_QUEUES_SHARDS,
  type EventsQueuePayloadIncomingEvent,
  eventsGroupQueues,
  gscQueue,
  importQueue,
  insightsQueue,
  miscQueue,
  notificationQueue,
  queueLogger,
  sessionsQueue,
} from '@openpanel/queue';
import { getRedisQueue } from '@openpanel/redis';
import type { Queue, WorkerOptions } from 'bullmq';
import { Worker } from 'bullmq';
import { Worker as GroupWorker } from 'groupmq';
import { cohortComputeJob } from './jobs/cohort.compute';
import { cronJob } from './jobs/cron';
import { incomingEvent } from './jobs/events.incoming-event';
import { gscJob } from './jobs/gsc';
import { importJob } from './jobs/import';
import { insightsProjectJob } from './jobs/insights';
import { miscJob } from './jobs/misc';
import { notificationJob } from './jobs/notification';
import { sessionsJob } from './jobs/sessions';
import { eventsGroupJobDuration } from './metrics';
import { setShuttingDown } from './utils/graceful-shutdown';
import {
  enableEventsHeartbeat,
  markEventsActivity,
} from './utils/worker-heartbeat';
import { logger } from './utils/logger';

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
    logger.info(
      { totalEventShards: EVENTS_GROUP_QUEUES_SHARDS },
      'No ENABLED_QUEUES specified, starting all queues',
    );
    return [
      'events',
      'sessions',
      'cron',
      'notification',
      'misc',
      'import',
      'insights',
      'gsc',
      'cohortCompute',
    ];
  }

  const queues = enabledQueuesEnv
    .split(',')
    .map((q) => q.trim())
    .filter(Boolean);

  logger.info(
    { queues, totalEventShards: EVENTS_GROUP_QUEUES_SHARDS },
    'Starting queues from ENABLED_QUEUES',
  );
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

export function bootWorkers() {
  const enabledQueues = getEnabledQueues();

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

  if (eventQueuesToStart.length > 0) {
    enableEventsHeartbeat();
  }

  for (const index of eventQueuesToStart) {
    const queue = eventsGroupQueues[index];
    if (!queue) {
      continue;
    }

    const queueName = `events_${index}`;
    const concurrency = getConcurrencyFor(
      queueName,
      Number.parseInt(process.env.EVENT_JOB_CONCURRENCY || '10', 10)
    );

    const worker = new GroupWorker<EventsQueuePayloadIncomingEvent['payload']>({
      queue,
      concurrency,
      logger: process.env.NODE_ENV === 'production' ? queueLogger : undefined,
      blockingTimeoutSec: Number.parseFloat(
        process.env.EVENT_BLOCKING_TIMEOUT_SEC || '1'
      ),
      handler: async (job) => {
        return await incomingEvent(job.data);
      },
    });

    // Consumer-loop heartbeat for the readiness probe. `completed` fires after
    // each processed job; `drained` fires on each poll cycle that finds the
    // queue empty. Together they refresh the timestamp every poll cycle while
    // the consumer is alive — busy or idle.
    worker.on('completed', markEventsActivity);
    worker.on('drained', markEventsActivity);

    worker.run();
    workers.push(worker);
    logger.info({ concurrency }, `Started worker for ${queueName}`);
  }

  // Start sessions worker
  if (enabledQueues.includes('sessions')) {
    const concurrency = getConcurrencyFor('sessions');
    const sessionsWorker = new Worker(sessionsQueue.name, sessionsJob, {
      ...workerOptions,
      concurrency,
    });
    workers.push(sessionsWorker);
    logger.info({ concurrency }, 'Started worker for sessions');
  }

  // Start cron worker
  if (enabledQueues.includes('cron')) {
    const concurrency = getConcurrencyFor('cron');
    const cronWorker = new Worker(cronQueue.name, cronJob, {
      ...workerOptions,
      concurrency,
    });
    workers.push(cronWorker);
    logger.info({ concurrency }, 'Started worker for cron');
  }

  // Start notification worker
  if (enabledQueues.includes('notification')) {
    const concurrency = getConcurrencyFor('notification');
    const notificationWorker = new Worker(
      notificationQueue.name,
      notificationJob,
      { ...workerOptions, concurrency }
    );
    workers.push(notificationWorker);
    logger.info({ concurrency }, 'Started worker for notification');
  }

  // Start misc worker
  if (enabledQueues.includes('misc')) {
    const concurrency = getConcurrencyFor('misc');
    const miscWorker = new Worker(miscQueue.name, miscJob, {
      ...workerOptions,
      concurrency,
    });
    workers.push(miscWorker);
    logger.info({ concurrency }, 'Started worker for misc');
  }

  // Start import worker
  if (enabledQueues.includes('import')) {
    const concurrency = getConcurrencyFor('import');
    const importWorker = new Worker(importQueue.name, importJob, {
      ...workerOptions,
      concurrency,
    });
    workers.push(importWorker);
    logger.info({ concurrency }, 'Started worker for import');
  }

  // Start insights worker
  if (enabledQueues.includes('insights')) {
    const concurrency = getConcurrencyFor('insights', 5);
    const insightsWorker = new Worker(insightsQueue.name, insightsProjectJob, {
      ...workerOptions,
      concurrency,
    });
    workers.push(insightsWorker);
    logger.info({ concurrency }, 'Started worker for insights');
  }

  // Start gsc worker
  if (enabledQueues.includes('gsc')) {
    const concurrency = getConcurrencyFor('gsc', 5);
    const gscWorker = new Worker(gscQueue.name, gscJob, {
      ...workerOptions,
      concurrency,
    });
    workers.push(gscWorker);
    logger.info({ concurrency }, 'Started worker for gsc');
  }

  // Start cohortCompute worker
  if (enabledQueues.includes('cohortCompute')) {
    const concurrency = getConcurrencyFor('cohortCompute', 2);
    const cohortComputeWorker = new Worker(
      cohortComputeQueue.name,
      cohortComputeJob,
      {
        ...workerOptions,
        concurrency,
      },
    );
    workers.push(cohortComputeWorker);
    logger.info({ concurrency }, 'Started worker for cohortCompute');
  }

  if (workers.length === 0) {
    logger.warn(
      'No workers started. Check ENABLED_QUEUES environment variable.'
    );
  }

  workers.forEach((worker) => {
    (worker as Worker).on('error', (error) => {
      logger.error({ err: error, worker: worker.name }, 'worker error');
    });

    (worker as Worker).on('closed', () => {
      logger.info({ worker: worker.name }, 'worker closed');
    });

    (worker as Worker).on('ready', () => {
      logger.info({ worker: worker.name }, 'worker ready');
    });

    (worker as Worker).on('failed', (job) => {
      if (job) {
        if (job.processedOn && job.finishedOn) {
          const elapsed = job.finishedOn - job.processedOn;
          eventsGroupJobDuration.observe(
            { name: worker.name, status: 'failed' },
            elapsed
          );
        }
        logger.error(
          {
            jobId: job.id,
            worker: worker.name,
            data: job.data,
            failedReason: job.failedReason,
            options: job.opts,
          },
          'job failed',
        );
      }
    });

    (worker as Worker).on('ioredis:close', () => {
      logger.error(
        { worker: worker.name },
        'worker closed due to ioredis:close',
      );
    });
  });

  async function exitHandler(
    eventName: string,
    evtOrExitCodeOrError: number | string | Error
  ) {
    // Log the actual error details for unhandled rejections/exceptions
    if (evtOrExitCodeOrError instanceof Error) {
      logger.error(
        { err: evtOrExitCodeOrError, eventName },
        'Unhandled error triggered shutdown',
      );
    } else {
      logger.info(
        { code: evtOrExitCodeOrError, eventName },
        'Starting graceful shutdown',
      );
    }
    try {
      const time = performance.now();

      // Wait for cron queue to empty if it's running
      if (enabledQueues.includes('cron')) {
        await waitForQueueToEmpty(cronQueue);
      }

      await Promise.all(workers.map((worker) => worker.close()));

      logger.info(
        { elapsed: performance.now() - time },
        'workers closed successfully',
      );
    } catch (e) {
      logger.error(
        { err: e, code: evtOrExitCodeOrError },
        'exit handler error',
      );
    }
    const exitCode = Number.isNaN(+evtOrExitCodeOrError)
      ? 1
      : +evtOrExitCodeOrError;
    process.exit(exitCode);
  }

  ['uncaughtException', 'unhandledRejection', 'SIGTERM', 'SIGINT'].forEach(
    (evt) => {
      process.on(evt, (code) => {
        setShuttingDown(true);
        exitHandler(evt, code);
      });
    }
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
      logger.warn(
        { queue: queue.name, remainingCount: activeCount },
        'Timeout reached while waiting for queue to empty',
      );
      break;
    }

    logger.info(
      { queue: queue.name, count: activeCount },
      'Waiting for queue to finish',
    );
    await sleep(500);
  }
}
