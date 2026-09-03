import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { rawStderrWrite } from '@openpanel/core';
import {
  cohortComputeQueue,
  cronQueue,
  gscQueue,
  importQueue,
  insightsQueue,
  notificationQueue,
  sessionsQueue,
} from '@openpanel/queue';
import { getRedisQueue } from '@openpanel/redis';
import type { Queue, WorkerOptions } from 'bullmq';
import { Worker } from 'bullmq';
import { cohortComputeJob } from './jobs/cohort.compute';
import { cronJob } from './jobs/cron';
import {
  type KafkaConsumerHandle,
  startKafkaEventsConsumer,
} from './jobs/events.kafka-consumer';
import { gscJob } from './jobs/gsc';
import { importJob } from './jobs/import';
import { insightsProjectJob } from './jobs/insights';
import { notificationJob } from './jobs/notification';
import { sessionsJob } from './jobs/sessions';
import { eventsGroupJobDuration } from './metrics';
import { setShuttingDown } from './utils/graceful-shutdown';
import { logger } from './utils/logger';
import { enableEventsHeartbeat } from './utils/worker-heartbeat';

const workerOptions: WorkerOptions = {
  connection: getRedisQueue(),
};

// The Kafka events consumer's token. Renamed from `events_kafka` (ADR-004
// rec 5/6 + docs/ANSWERS.md §1.3): there is one events transport now, so
// there is one token for it.
const KAFKA_QUEUE_NAME = 'events';

// The seven BullMQ registry queues (ADR-005). Kept in sync with
// packages/core/src/jobs.registry.ts by hand until the worker merges into
// core at P9.
const REGISTRY_QUEUE_NAMES = [
  'sessions',
  'cron',
  'notification',
  'import',
  'insights',
  'gsc',
  'cohortCompute',
] as const;

const KNOWN_QUEUE_NAMES = [KAFKA_QUEUE_NAME, ...REGISTRY_QUEUE_NAMES] as const;

type QueueName = (typeof KNOWN_QUEUE_NAMES)[number];

const RENAMED_QUEUE_TOKENS: Record<string, string> = {
  events_kafka: KAFKA_QUEUE_NAME,
};

/**
 * Fails boot loudly on an unknown ENABLED_QUEUES token, instead of V1's
 * silent ignore (docs/ANSWERS.md §1.3 ruling). `events_kafka` gets a message
 * naming the rename; anything else names the offending value and the
 * accepted set.
 */
export function assertKnownQueue(value: string): void {
  if ((KNOWN_QUEUE_NAMES as readonly string[]).includes(value)) {
    return;
  }

  const renamedTo = RENAMED_QUEUE_TOKENS[value];
  if (renamedTo) {
    logger.fatal(
      { value, renamedTo, accepted: KNOWN_QUEUE_NAMES },
      `ENABLED_QUEUES: "${value}" was renamed to "${renamedTo}" — update ENABLED_QUEUES to use the new name.`
    );
    process.exit(1);
    return;
  }

  logger.fatal(
    { value, accepted: KNOWN_QUEUE_NAMES },
    `ENABLED_QUEUES: unknown queue "${value}". Accepted values: ${KNOWN_QUEUE_NAMES.join(', ')}.`
  );
  process.exit(1);
}

/**
 * Parses the ENABLED_QUEUES environment variable and returns an array of queue names to start.
 * If no env var is provided, returns all queues.
 */
export function getEnabledQueues(): QueueName[] {
  const enabledQueuesEnv = process.env.ENABLED_QUEUES?.trim();

  if (!enabledQueuesEnv) {
    logger.info('No ENABLED_QUEUES specified, starting all queues');
    return [...KNOWN_QUEUE_NAMES];
  }

  const queues = enabledQueuesEnv
    .split(',')
    .map((q) => q.trim())
    .filter(Boolean);

  for (const queue of queues) {
    assertKnownQueue(queue);
  }

  logger.info({ queues }, 'Starting queues from ENABLED_QUEUES');
  return queues as QueueName[];
}

/**
 * Gets the concurrency setting for a queue from environment variables.
 * Env var format: {QUEUE_NAME}_CONCURRENCY (e.g., SESSIONS_CONCURRENCY=32)
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

  const workers: Worker[] = [];
  const extraStops: Array<() => Promise<unknown>> = [];

  // Start Kafka events consumer — the sole events transport (ADR-004).
  if (enabledQueues.includes(KAFKA_QUEUE_NAME)) {
    enableEventsHeartbeat();
    let handle: KafkaConsumerHandle | null = null;
    const startPromise = startKafkaEventsConsumer()
      .then((h) => {
        handle = h;
        logger.info('Started Kafka events consumer');
      })
      .catch((err) => {
        logger.error({ err }, 'Failed to start Kafka events consumer');
      });
    extraStops.push(async () => {
      await startPromise.catch(() => undefined);
      if (handle) {
        await handle.stop();
      }
    });
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
      }
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
    worker.on('error', (error) => {
      logger.error({ err: error, worker: worker.name }, 'worker error');
    });

    worker.on('closed', () => {
      logger.info({ worker: worker.name }, 'worker closed');
    });

    worker.on('ready', () => {
      logger.info({ worker: worker.name }, 'worker ready');
    });

    worker.on('failed', (job) => {
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
          'job failed'
        );
      }
    });

    worker.on('ioredis:close', () => {
      logger.error(
        { worker: worker.name },
        'worker closed due to ioredis:close'
      );
    });
  });

  async function exitHandler(
    eventName: string,
    evtOrExitCodeOrError: number | string | Error
  ) {
    logger.info(
      { code: evtOrExitCodeOrError, eventName },
      'Starting graceful shutdown'
    );

    // Hard deadline: if cron drain or worker.close() hangs, force-exit
    // before Docker's stop_grace_period elapses. Without this the
    // container sits in "Stopping" until SIGKILL (exit 137) and looks
    // like a real crash to the swarm.
    const forceExitMs = Number(process.env.SHUTDOWN_FORCE_EXIT_MS || '20000');
    const exitCode = Number.isNaN(+evtOrExitCodeOrError)
      ? 1
      : +evtOrExitCodeOrError;
    const forceExit = setTimeout(() => {
      logger.error(
        { eventName, forceExitMs },
        'Graceful shutdown timed out — forcing exit'
      );
      process.exit(exitCode);
    }, forceExitMs);
    forceExit.unref();

    try {
      const time = performance.now();

      // Wait for cron queue to empty if it's running
      if (enabledQueues.includes('cron')) {
        await waitForQueueToEmpty(cronQueue);
      }

      await Promise.all([
        ...workers.map((worker) => worker.close()),
        ...extraStops.map((stop) =>
          stop().catch((err) => {
            logger.error({ err }, 'extra stop handler error');
          })
        ),
      ]);

      logger.info(
        { elapsed: performance.now() - time },
        'workers closed successfully'
      );
    } catch (e) {
      logger.error(
        { err: e, code: evtOrExitCodeOrError },
        'exit handler error'
      );
    }
    clearTimeout(forceExit);
    process.exit(exitCode);
  }

  // SIGTERM / SIGINT: drain in-flight jobs, then exit.
  ['SIGTERM', 'SIGINT'].forEach((evt) => {
    process.on(evt, (code) => {
      setShuttingDown(true);
      exitHandler(evt, code);
    });
  });

  // uncaughtException / unhandledRejection: process state is corrupt.
  // Don't try to drain — log and exit fast so Docker respawns us.
  // Mirror fatals to the real stderr (bypassing the output interceptor, so
  // nothing ships twice) — the OTLP flush window can be lost on the way
  // down, and `docker logs` must always show why we died.
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception — exiting');
    rawStderrWrite(`Uncaught exception — exiting: ${error?.stack ?? error}\n`);
    setShuttingDown(true);
    setTimeout(() => process.exit(1), 1000).unref();
  });
  process.on('unhandledRejection', (reason, promise) => {
    logger.fatal({ reason, promise }, 'Unhandled rejection — exiting');
    rawStderrWrite(
      `Unhandled rejection — exiting: ${
        reason instanceof Error ? reason.stack : String(reason)
      }\n`
    );
    setShuttingDown(true);
    setTimeout(() => process.exit(1), 1000).unref();
  });

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
        'Timeout reached while waiting for queue to empty'
      );
      break;
    }

    logger.info(
      { queue: queue.name, count: activeCount },
      'Waiting for queue to finish'
    );
    await sleep(500);
  }
}
