import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import express from 'express';

import { createInitialSalts } from '@openpanel/db';
import {
  cronQueue,
  eventsQueue,
  miscQueue,
  notificationQueue,
  sessionsQueue,
} from '@openpanel/queue';
import client from 'prom-client';

import sourceMapSupport from 'source-map-support';
import { bootCron } from './boot-cron';
import { bootWorkers } from './boot-workers';
import { register } from './metrics';
import { logger } from './utils/logger';

sourceMapSupport.install();

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
        new BullMQAdapter(eventsQueue),
        new BullMQAdapter(sessionsQueue),
        new BullMQAdapter(cronQueue),
        new BullMQAdapter(notificationQueue),
        new BullMQAdapter(miscQueue),
      ],
      serverAdapter: serverAdapter,
    });

    app.use('/', serverAdapter.getRouter());
  }

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
