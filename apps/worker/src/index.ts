import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { tryCatch } from '@openpanel/common';
import { chQuery, createInitialSalts, db } from '@openpanel/db';
import {
  cohortComputeQueue,
  cronQueue,
  eventsGroupQueues,
  gscQueue,
  importQueue,
  insightsQueue,
  miscQueue,
  notificationQueue,
  sessionsQueue,
} from '@openpanel/queue';
import { getRedisCache } from '@openpanel/redis';
import express from 'express';
import { BullBoardGroupMQAdapter } from 'groupmq';
import client from 'prom-client';
import sourceMapSupport from 'source-map-support';
import { bootCron } from './boot-cron';
import { bootWorkers } from './boot-workers';
import { register } from './metrics';
import { isShuttingDown } from './utils/graceful-shutdown';
import { logger } from './utils/logger';
import { getEventsHeartbeat } from './utils/worker-heartbeat';

const EVENTS_HEARTBEAT_STALE_MS = 60_000;

sourceMapSupport.install();

async function start() {
  const collectDefaultMetrics = client.collectDefaultMetrics;
  collectDefaultMetrics({ register });

  const PORT = Number.parseInt(process.env.WORKER_PORT || '3000', 10);
  const app = express();

  if (
    process.env.DISABLE_BULLBOARD !== '1' &&
    process.env.DISABLE_BULLBOARD !== 'true'
  ) {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/');
    createBullBoard({
      queues: [
        ...eventsGroupQueues.map(
          (queue) => new BullBoardGroupMQAdapter(queue) as any
        ),
        new BullMQAdapter(sessionsQueue),
        new BullMQAdapter(cronQueue),
        new BullMQAdapter(notificationQueue),
        new BullMQAdapter(miscQueue),
        new BullMQAdapter(importQueue),
        new BullMQAdapter(insightsQueue),
        new BullMQAdapter(gscQueue),
        new BullMQAdapter(cohortComputeQueue),
      ],
      serverAdapter,
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

  app.get('/healthcheck', async (req, res) => {
    const [redisResult, dbResult, chResult] = await Promise.all([
      tryCatch(async () => (await getRedisCache().ping()) === 'PONG'),
      tryCatch(async () => !!(await db.$executeRaw`SELECT 1`)),
      tryCatch(async () => (await chQuery('SELECT 1')).length > 0),
    ]);

    const dependencies = {
      redis: redisResult.ok && redisResult.data,
      db: dbResult.ok && dbResult.data,
      ch: chResult.ok && chResult.data,
    };
    const dependencyErrors = {
      redis: redisResult.error?.message,
      db: dbResult.error?.message,
      ch: chResult.error?.message,
    };

    const failedDependencies = Object.entries(dependencies)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);
    const workingDependencies = Object.entries(dependencies)
      .filter(([, ok]) => ok)
      .map(([name]) => name);

    const status = failedDependencies.length === 0 ? 200 : 503;

    if (status !== 200) {
      logger.warn('healthcheck failed', {
        workingDependencies,
        failedDependencies,
        dependencies,
        dependencyErrors,
      });
    }

    res.status(status).json({
      ready: status === 200,
      ...dependencies,
      failedDependencies,
      workingDependencies,
    });
  });

  // Kubernetes liveness — shallow, event loop only.
  app.get('/healthz/live', (req, res) => {
    res.status(200).json({ live: true });
  });

  // Kubernetes readiness — shallow + shutdown-aware. When events workers run
  // on this instance, also require the events consumer-loop heartbeat to be
  // fresh (refreshed on each `completed`/`drained` event). If events are not
  // enabled here, the heartbeat check is skipped.
  app.get('/healthz/ready', (req, res) => {
    if (isShuttingDown()) {
      res.status(503).json({ ready: false, reason: 'shutting down' });
      return;
    }

    const { enabled, lastActivityAt } = getEventsHeartbeat();
    if (enabled) {
      const idleMs = Date.now() - lastActivityAt;
      if (idleMs > EVENTS_HEARTBEAT_STALE_MS) {
        res.status(503).json({
          ready: false,
          reason: 'events consumer heartbeat stale',
          idleMs,
          thresholdMs: EVENTS_HEARTBEAT_STALE_MS,
        });
        return;
      }
    }

    res.status(200).json({ ready: true });
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
