// V2 boot entrypoint (ADR-007 §7 "apps/api — three files"; TARGET_ARCHITECTURE
// §7 main.ts boot order). Runs on Bun; the V1 Fastify boot at `./index.ts`
// keeps serving the golden harness untouched until `apps/worker` is deleted
// at P9.
//
// This is the M3 gate boot only: db/ch/redis/clients are not wired into
// `AppDeps` yet — their types stay the `unknown` stubs `context.ts` declares
// until P3/P4 land the real clients — so only the ops surface (healthz +
// metrics) is mounted here. `dashboardRoutes`/`publicApiRoutes` land with
// their first module (see `rest.routes.ts`). The buffers ARE real from M8-001:
// `createBuffers` builds them once, here, and nowhere else.

process.env.TZ = 'UTC';

import {
  type AppDeps,
  type BufferDeps,
  createBuffers,
  opsRoutes,
  type QueueProducerHandle,
  queues,
  registerBufferMetrics,
} from '@openpanel/core';
import pino from 'pino';
import { type Config, loadConfig } from './config/env';

const SHUTDOWN_FORCE_EXIT_MS = 5000;
// The registry key and the Redis name are the same string for all seven queues
// (jobs.registry.ts); `queueKey` only braces it under `QUEUE_CLUSTER`, which no
// deployment sets.
const CRON_QUEUE_NAME = 'cron';
// Used only to report a config error itself — the real level isn't known
// until `config/env.ts` has validated `LOG_LEVEL`.
const BOOTSTRAP_LOG_LEVEL = 'info';

/**
 * `config/env.ts` is the sole `process.env` reader on this path; an invalid
 * value fails boot loudly, naming every offending value at once (never just
 * the first), instead of being silently ignored or misinterpreted.
 */
function loadConfigOrExit(): Config {
  try {
    return loadConfig();
  } catch (error) {
    pino({ name: 'api', level: BOOTSTRAP_LOG_LEVEL }).fatal(
      { err: error },
      'Refusing to start'
    );
    process.exit(1);
  }
}

const config = loadConfigOrExit();
const logger = pino({ name: 'api', level: config.LOG_LEVEL });

/**
 * `AppDeps.producers` needs a real `QueueProducerHandle`, but core's exports
 * map (ADR-008) only publishes the type — `createProducers` is internal.
 * Every registry queue's `jobs` map is still empty (no module has landed
 * one, see jobs.registry.ts), so there is nothing to enqueue yet; this stub
 * satisfies the type with no Redis connection. It is replaced by a real
 * `createProducers` call site inside core once a module needs to enqueue.
 */
function stubProducers(): QueueProducerHandle {
  const emptyQueues = Object.fromEntries(
    Object.keys(queues).map((name) => [name, {}])
  ) as QueueProducerHandle['queues'];

  const notWired = (): never => {
    throw new Error('Job producers are not wired up yet (M3 boot stub)');
  };

  return {
    queues: emptyQueues,
    scope: () => emptyQueues,
    enqueue: notWired,
    remove: notWired,
    bullQueues: [],
    close: () => Promise.resolve(),
  };
}

/**
 * A named child of the boot logger per buffer, plus the buffers' one direct
 * BullMQ read — ADR-005's `bullQueues` escape hatch.
 * Pausing `cron` from bull-board halts ALL buffer flushing, preserved
 * deliberately (docs/ANSWERS.md §3: "known!"). The M3 producer stub owns no
 * queues yet, and a queue that does not exist has not been paused.
 */
function bufferDeps(producers: QueueProducerHandle): BufferDeps {
  return {
    createLogger: (name) => logger.child({ name }),
    isCronPaused: async () => {
      const cron = producers.bullQueues.find(
        (queue) => queue.name === CRON_QUEUE_NAME
      );
      return cron ? await cron.isPaused() : false;
    },
  };
}

function buildDeps(): AppDeps {
  const producers = stubProducers();
  return {
    // db/ch/redis/clients are `unknown` stubs in context.ts until P3/P4 land
    // the real clients — reading one before its type lands is meant to be a
    // compile error, not a runtime `undefined`.
    db: undefined,
    ch: undefined,
    redis: undefined,
    clients: undefined,
    buffers: createBuffers(bufferDeps(producers)),
    producers,
    logger,
    config: { selfHosted: config.SELF_HOSTED },
  };
}

async function main() {
  const role = config.ROLE;
  const port = config.API_PORT;
  const deps = buildDeps();

  // Scrape-time collectors register only where a role consumes queues: the
  // LLEN gauges cost one Redis round trip per buffer per scrape, and ten API
  // replicas exposing them would multiply that for no new information
  // (TARGET_ARCHITECTURE §18).
  if (role !== 'api') {
    registerBufferMetrics(deps.buffers);
  }

  const app = opsRoutes(deps);

  if (role !== 'api') {
    logger.info(
      { role },
      'ROLE=%s: worker/ingest bootstrap (workers, schedulers, Kafka consumer) is not implemented yet — running the HTTP ops surface only',
      role
    );
  }

  app.listen(port, () => {
    logger.info({ role, port }, 'API listening');
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'Starting graceful shutdown');

    const forceExit = setTimeout(() => {
      logger.error({ signal }, 'Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, SHUTDOWN_FORCE_EXIT_MS);
    forceExit.unref();

    try {
      await app.stop();
      await deps.producers.close();
      logger.info('Graceful shutdown completed');
      clearTimeout(forceExit);
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Error during graceful shutdown');
      clearTimeout(forceExit);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
}

main();
