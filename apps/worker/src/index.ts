import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/dist/src/queueAdapters/bullMQ.js';
import { ExpressAdapter } from '@bull-board/express';
import express from 'express';

import { createInitialSalts } from '@openpanel/db';
import {
  cronQueue,
  eventsGroupQueue,
  miscQueue,
  notificationQueue,
  sessionsQueue,
} from '@openpanel/queue';
import client from 'prom-client';

import { getRedisQueue } from '@openpanel/redis';
import { Queue, Worker } from 'bullmq';
import { BullBoardGroupMQAdapter } from 'groupmq';
import sourceMapSupport from 'source-map-support';
import { bootCron } from './boot-cron';
import { bootWorkers } from './boot-workers';
import { register } from './metrics';
import { logger } from './utils/logger';

sourceMapSupport.install();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const test = new Worker(
  'duplicateEvents',
  async (job) => {
    await sleep(5000);

    return 'done';
  },
  {
    connection: getRedisQueue(),
  },
);

const testQueue = new Queue('duplicateEvents', {
  connection: getRedisQueue(),
  defaultJobOptions: {
    removeOnComplete: {
      age: 10,
    },
  },
});

async function start() {
  const collectDefaultMetrics = client.collectDefaultMetrics;
  collectDefaultMetrics({ register });

  const PORT = Number.parseInt(process.env.WORKER_PORT || '3000', 10);
  const app = express();

  if (process.env.DISABLE_BULLBOARD === undefined) {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/');
    createBullBoard({
      queues: [
        new BullBoardGroupMQAdapter(eventsGroupQueue) as any,
        new BullMQAdapter(sessionsQueue),
        new BullMQAdapter(cronQueue),
        new BullMQAdapter(notificationQueue),
        new BullMQAdapter(miscQueue),
      ],
      serverAdapter: serverAdapter,
    });

    app.use('/', serverAdapter.getRouter());
  }

  const hashPayload = (payload: Record<string, unknown>) => {
    return 'event-hash-here...';
  };

  app.get('/test', async (req, res) => {
    try {
      const job = await testQueue.add(
        'test',
        {
          message: 'Test job!',
        },
        {
          jobId: hashPayload(req.body),
        },
      );
      res.json({ jobId: job.id, opts: job.opts, status: await job.getState() });
    } catch (error) {
      console.log('error', error);

      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Unknown error' });
      }
    }
  });

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

  app.get('/healthcheck', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.listen(PORT, () => {
    console.log(`For the UI, open http://localhost:${PORT}/`);
  });

  if (process.env.DISABLE_WORKERS === undefined) {
    await bootWorkers();
    await bootCron();
  } else {
    logger.warn('Workers are disabled');
  }

  await createInitialSalts();
}

start();
