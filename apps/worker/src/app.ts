import { timingSafeEqual } from 'node:crypto';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { tryCatch } from '@openpanel/common';
import { chQuery, db } from '@openpanel/db';
import {
  cohortComputeQueue,
  cronQueue,
  eventsGroupQueues,
  gscQueue,
  importQueue,
  insightsQueue,
  notificationQueue,
  sessionsQueue,
} from '@openpanel/queue';
import { getRedisCache } from '@openpanel/redis';
import express, { type Express, type RequestHandler } from 'express';
import { BullBoardGroupMQAdapter } from 'groupmq';
import { bootDebugRoutes } from './boot-debug';
import { register } from './metrics';
import { isShuttingDown } from './utils/graceful-shutdown';
import { logger } from './utils/logger';
import { getEventsHeartbeat } from './utils/worker-heartbeat';

const EVENTS_HEARTBEAT_STALE_MS = 60_000;

const isOff = (value: string | undefined) => value === '1' || value === 'true';

/**
 * Compare two strings without letting the time taken depend on how much of
 * them matches. `timingSafeEqual` throws on differing lengths, so a mismatch
 * still runs a same-length comparison before returning false.
 */
function safeEqual(a: string, b: string) {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

function basicAuth(username: string, password: string): RequestHandler {
  return (req, res, next) => {
    const [scheme, encoded] = (req.headers.authorization ?? '').split(' ');

    if (scheme?.toLowerCase() !== 'basic' || !encoded) {
      res
        .set('WWW-Authenticate', 'Basic realm="Queues"')
        .status(401)
        .send('Unauthorized');
      return;
    }

    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    const givenUsername =
      separator === -1 ? decoded : decoded.slice(0, separator);
    const givenPassword = separator === -1 ? '' : decoded.slice(separator + 1);

    // Both comparisons always run so a wrong username costs the same as a
    // wrong password.
    const usernameOk = safeEqual(givenUsername, username);
    const passwordOk = safeEqual(givenPassword, password);

    if (!(usernameOk && passwordOk)) {
      res
        .set('WWW-Authenticate', 'Basic realm="Queues"')
        .status(401)
        .send('Unauthorized');
      return;
    }

    next();
  };
}

/**
 * The dashboard is mounted at `/` and swallows every unmatched path, so it can
 * only go on after the routes that must stay open. It is mounted at all only
 * when a username and a password are configured — without them there is
 * nothing to mount it behind, and requests fall through to Express' 404.
 */
function mountBullBoard(app: Express) {
  const username = process.env.BULLBOARD_USERNAME;
  const password = process.env.BULLBOARD_PASSWORD;

  if (isOff(process.env.DISABLE_BULLBOARD)) {
    return;
  }

  if (!(username && password)) {
    logger.warn(
      'Queue dashboard not mounted: set BULLBOARD_USERNAME and BULLBOARD_PASSWORD to enable it'
    );
    return;
  }

  const readOnly =
    process.env.BULLBOARD_READONLY !== '0' &&
    process.env.BULLBOARD_READONLY !== 'false';
  const adapterOptions = { readOnlyMode: readOnly, allowRetries: !readOnly };

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/');
  createBullBoard({
    queues: [
      ...eventsGroupQueues.map(
        (queue) => new BullBoardGroupMQAdapter(queue, adapterOptions) as any
      ),
      new BullMQAdapter(sessionsQueue, adapterOptions),
      new BullMQAdapter(cronQueue, adapterOptions),
      new BullMQAdapter(notificationQueue, adapterOptions),
      new BullMQAdapter(importQueue, adapterOptions),
      new BullMQAdapter(insightsQueue, adapterOptions),
      new BullMQAdapter(gscQueue, adapterOptions),
      new BullMQAdapter(cohortComputeQueue, adapterOptions),
    ],
    serverAdapter,
  });

  app.use('/', basicAuth(username, password), serverAdapter.getRouter());
}

export function createApp() {
  const app = express();

  // Local-only: trigger cron jobs on demand. Disabled in production. Mounted
  // before bull-board so its routes take precedence.
  if (process.env.NODE_ENV !== 'production') {
    bootDebugRoutes(app);
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
      logger.warn(
        {
          workingDependencies,
          failedDependencies,
          dependencies,
          dependencyErrors,
        },
        'healthcheck failed'
      );
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

  mountBullBoard(app);

  return app;
}
