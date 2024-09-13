import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { WorkerOptions } from 'bullmq';
import { Worker } from 'bullmq';
import express from 'express';

import { createInitialSalts } from '@openpanel/db';
import { cronQueue, eventsQueue, sessionsQueue } from '@openpanel/queue';
import { getRedisQueue } from '@openpanel/redis';

import { cronJob } from './jobs/cron';
import { eventsJob } from './jobs/events';
import { sessionsJob } from './jobs/sessions';
import { register } from './metrics';
import { logger } from './utils/logger';

const PORT = parseInt(process.env.WORKER_PORT || '3000', 10);
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/');
const app = express();

const workerOptions: WorkerOptions = {
  connection: getRedisQueue(),
  concurrency: parseInt(process.env.CONCURRENCY || '1', 10),
};

async function start() {
  const eventsWorker = new Worker(eventsQueue.name, eventsJob, workerOptions);
  const sessionsWorker = new Worker(
    sessionsQueue.name,
    sessionsJob,
    workerOptions
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
      logger.error('job failed', {
        worker: worker.name,
        data: job?.data,
        error: job?.failedReason,
        options: job?.opts,
      });
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

    process.exit(isNaN(+evtOrExitCodeOrError) ? 1 : +evtOrExitCodeOrError);
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
    })
  );

  await cronQueue.add(
    'salt',
    {
      type: 'salt',
      payload: undefined,
    },
    {
      jobId: 'salt',
      repeat: {
        utc: true,
        pattern: '0 0 * * *',
      },
    }
  );

  await cronQueue.add(
    'flush',
    {
      type: 'flushEvents',
      payload: undefined,
    },
    {
      jobId: 'flushEvents',
      repeat: {
        every: process.env.BATCH_INTERVAL
          ? parseInt(process.env.BATCH_INTERVAL, 10)
          : 1000 * 10,
      },
    }
  );

  await cronQueue.add(
    'flush',
    {
      type: 'flushProfiles',
      payload: undefined,
    },
    {
      jobId: 'flushProfiles',
      repeat: {
        every: process.env.BATCH_INTERVAL
          ? parseInt(process.env.BATCH_INTERVAL, 10)
          : 1000 * 10,
      },
    }
  );

  if (process.env.SELF_HOSTED && process.env.NODE_ENV === 'production') {
    await cronQueue.add(
      'ping',
      {
        type: 'ping',
        payload: undefined,
      },
      {
        jobId: 'ping',
        repeat: {
          pattern: '0 0 * * *',
        },
      }
    );
  }

  const repeatableJobs = await cronQueue.getRepeatableJobs();

  console.log('Repeatable jobs:');
  console.log(repeatableJobs);

  await createInitialSalts();
}

start();
