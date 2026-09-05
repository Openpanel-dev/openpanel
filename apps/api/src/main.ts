// V2 boot entrypoint (ADR-007 §7 "apps/api — three files"; TARGET_ARCHITECTURE
// §7 main.ts boot order). Runs on Bun; the V1 Fastify boot at `./index.ts`
// keeps serving the golden harness untouched until `apps/worker` is deleted
// at P9.
//
// This is the M3 gate boot only: db/ch/clients are not wired into `AppDeps`
// yet — their types stay the `unknown` stubs `context.ts` declares until
// P3/P4 land the real clients — so only the ops surface (healthz + metrics)
// is mounted here. `dashboardRoutes`/`publicApiRoutes` land with their first
// module (see `rest.routes.ts`). The buffers ARE real from M8-001:
// `createBuffers` builds them once, here, and nowhere else. The producers are
// real from M9-001: all seven queues, envelope on, byte-identical Redis keys.
// Workers, schedulers and the ingest consumer are M9-002.

process.env.TZ = 'UTC';

import {
  type AppDeps,
  type BufferDeps,
  createBuffers,
  createProducers,
  opsRoutes,
  type QueueProducerHandle,
  queueKey,
  queues,
  registerBufferMetrics,
} from '@openpanel/core';
import { produceIncomingEvent } from '@openpanel/queue';
import { getRedisQueue } from '@openpanel/redis';
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
 * All seven queues, envelope on, on the Redis keys V1 already uses — so a job
 * V1 enqueued before the cutover is read back by V2's `resolveJob` through
 * that queue's compat hook, with no drain and no rename (ADR-005).
 *
 * The connection is `packages/redis`'s dedicated queue client: a separate
 * client from cache/pub/sub with `maxRetriesPerRequest: null`, which is what
 * BullMQ requires and exactly what V1's `packages/queue` producers connect
 * through. It stays that package's singleton to close (ADR-007 §7's accepted
 * pragmatic deviation); `producers.close()` closes the queues over it.
 */
function buildProducerHandle(): QueueProducerHandle {
  return createProducers(queues, {
    connection: getRedisQueue(),
    cluster: config.QUEUE_CLUSTER,
    logger,
  });
}

/**
 * A named child of the boot logger per buffer, plus the buffers' one direct
 * BullMQ read — ADR-005's `bullQueues` escape hatch.
 * Pausing `cron` from bull-board halts ALL buffer flushing, preserved
 * deliberately (docs/ANSWERS.md §3: "known!").
 */
function bufferDeps(producers: QueueProducerHandle): BufferDeps {
  // `bullQueues` are keyed by the Redis name, which `QUEUE_CLUSTER` braces.
  const cronKey = queueKey(CRON_QUEUE_NAME, { cluster: config.QUEUE_CLUSTER });

  return {
    createLogger: (name) => logger.child({ name }),
    isCronPaused: async () => {
      const cron = producers.bullQueues.find((queue) => queue.name === cronKey);
      return cron ? await cron.isPaused() : false;
    },
  };
}

function buildDeps(): AppDeps {
  const producers = buildProducerHandle();
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
    // @openpanel/queue's Kafka producer, injected because core cannot import
    // it back (M8-002). M8-003 replaces it with core's own.
    produceIncomingEvent,
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
