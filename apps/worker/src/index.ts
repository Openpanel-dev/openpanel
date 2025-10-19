import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { createInitialSalts } from '@openpanel/db';
import {
  cronQueue,
  eventsGroupQueue,
  importQueue,
  miscQueue,
  notificationQueue,
  sessionsQueue,
} from '@openpanel/queue';
import express from 'express';
import client from 'prom-client';

import { BullBoardGroupMQAdapter } from 'groupmq';
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
        new BullBoardGroupMQAdapter(eventsGroupQueue) as any,
        new BullMQAdapter(sessionsQueue),
        new BullMQAdapter(cronQueue),
        new BullMQAdapter(notificationQueue),
        new BullMQAdapter(miscQueue),
        new BullMQAdapter(importQueue),
      ],
      serverAdapter: serverAdapter,
    });

    app.use('/', serverAdapter.getRouter());
  }

  // TODO: REMOVE :D
  // app.get('/test', (req, res) => {
  //   importQueue.add('test', {
  //     type: 'import',
  //     payload: {
  //       importId: 'public-web',
  //       projectId: 'public-web',
  //       provider: 'umami',
  //       sourceType: 'file',
  //       sourceLocation:
  //         'https://umami-public.s3.eu-central-1.amazonaws.com/a70ff57d-f632-4292-a98b-658d7734fbec.csv.gz?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAZUN3SJZPVYG37IPH%2F20251017%2Feu-central-1%2Fs3%2Faws4_request&X-Amz-Date=20251017T150722Z&X-Amz-Expires=259200&X-Amz-Signature=0a60e739b5de1e6674397de94c44e97d5107bbbe7a57fc4c05c0fd394baae4eb&X-Amz-SignedHeaders=host&x-id=GetObject',
  //     },
  //   });
  //   res.json({ status: 'ok' });
  // });

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
