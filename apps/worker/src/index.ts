import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { WorkerOptions } from 'bullmq';
import { Worker } from 'bullmq';
import express from 'express';

import { createInitialSalts } from '@openpanel/db';
import type { CronQueueType } from '@openpanel/queue';
import { cronQueue, eventsQueue, sessionsQueue } from '@openpanel/queue';
import { getRedisQueue } from '@openpanel/redis';

import { cronJob } from './jobs/cron';
import { eventsJob } from './jobs/events';
import { sessionsJob } from './jobs/sessions';
import { register } from './metrics';
import { logger } from './utils/logger';

const PORT = Number.parseInt(process.env.WORKER_PORT || '3000', 10);
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/');
const app = express();

const workerOptions: WorkerOptions = {
  connection: getRedisQueue(),
  concurrency: Number.parseInt(process.env.CONCURRENCY || '1', 10),
};

async function start() {
  const eventsWorker = new Worker(eventsQueue.name, eventsJob, workerOptions);
  const sessionsWorker = new Worker(
    sessionsQueue.name,
    sessionsJob,
    workerOptions,
  );
  const cronWorker = new Worker(cronQueue.name, cronJob, workerOptions);

  createBullBoard({
    queues: [
      new BullMQAdapter(eventsQueue),
      new BullMQAdapter(sessionsQueue),
      new BullMQAdapter(cronQueue),
    ],
    serverAdapter: serverAdapter,
  });

  app.use('/', serverAdapter.getRouter());

  app.get('/metrics', (req, res) => {
    res.set('Content-Type', register.contentType);
    register
      .metrics()
      .then((metrics) => {
        res.end(metrics);
      })
      .catch((error) => {
        res.status(500).end(error);
      });
  });

  app.listen(PORT, () => {
    console.log(`For the UI, open http://localhost:${PORT}/`);
  });

  const workers = [sessionsWorker, eventsWorker, cronWorker];
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
          duration:
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

  async function exitHandler(evtOrExitCodeOrError: number | string | Error) {
    try {
      await eventsWorker.close();
      await sessionsWorker.close();
      await cronWorker.close();
    } catch (e) {
      logger.error('exit handler error', {
        code: evtOrExitCodeOrError,
        error: e,
      });
    }

    process.exit(
      Number.isNaN(+evtOrExitCodeOrError) ? 1 : +evtOrExitCodeOrError,
    );
  }

  [
    'beforeExit',
    'uncaughtException',
    'unhandledRejection',
    'SIGHUP',
    'SIGINT',
    'SIGQUIT',
    'SIGILL',
    'SIGTRAP',
    'SIGABRT',
    'SIGBUS',
    'SIGFPE',
    'SIGUSR1',
    'SIGSEGV',
    'SIGUSR2',
    'SIGTERM',
  ].forEach((evt) =>
    process.on(evt, (evt) => {
      exitHandler(evt);
    }),
  );

  const jobs: {
    name: string;
    type: CronQueueType;
    pattern: string | number;
  }[] = [
    {
      name: 'salt',
      type: 'salt',
      pattern: '0 0 * * *',
    },
    {
      name: 'flush',
      type: 'flushEvents',
      pattern: 1000 * 10,
    },
    {
      name: 'flush',
      type: 'flushProfiles',
      pattern: 1000 * 60,
    },
  ];

  if (process.env.SELF_HOSTED && process.env.NODE_ENV === 'production') {
    jobs.push({
      name: 'ping',
      type: 'ping',
      pattern: '0 0 * * *',
    });
  }

  // Add repeatable jobs
  for (const job of jobs) {
    await cronQueue.add(
      job.name,
      {
        type: job.type,
        payload: undefined,
      },
      {
        jobId: job.type,
        repeat:
          typeof job.pattern === 'number'
            ? {
                every: job.pattern,
              }
            : {
                pattern: job.pattern,
              },
      },
    );
  }

  // Remove outdated repeatable jobs
  const repeatableJobs = await cronQueue.getRepeatableJobs();
  for (const repeatableJob of repeatableJobs) {
    const match = jobs.find(
      (job) => `${job.name}:${job.type}:::${job.pattern}` === repeatableJob.key,
    );
    if (match) {
      logger.info('Repeatable job exists', {
        key: repeatableJob.key,
      });
    } else {
      logger.info('Removing repeatable job', {
        key: repeatableJob.key,
      });
      cronQueue.removeRepeatableByKey(repeatableJob.key);
    }
  }

  await createInitialSalts();
}

start();
