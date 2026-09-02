// V2 boot entrypoint (ADR-007 §7 "apps/api — three files"; TARGET_ARCHITECTURE
// §7 main.ts boot order). Runs on Bun; the V1 Fastify boot at `./index.ts`
// keeps serving the golden harness untouched until `apps/worker` is deleted
// at P9.
//
// This is the M3 gate boot only: db/ch/redis/clients/buffers are not wired
// into `AppDeps` yet — their types stay the `unknown` stubs `context.ts`
// declares until P3/P4/P8 land the real clients — so only the ops surface
// (healthz + metrics) is mounted here. `dashboardRoutes`/`publicApiRoutes`
// land with their first module (see `rest.routes.ts`).

process.env.TZ = 'UTC';

import {
  type AppDeps,
  opsRoutes,
  type QueueProducerHandle,
  queues,
} from '@openpanel/core';
import pino from 'pino';

const ROLE_VALUES = ['api', 'worker', 'all'] as const;
type Role = (typeof ROLE_VALUES)[number];

const DEFAULT_PORT = 3000;
const SHUTDOWN_FORCE_EXIT_MS = 5000;

const logger = pino({ name: 'api', level: process.env.LOG_LEVEL || 'info' });

/**
 * Same doctrine as `ENABLED_QUEUES` (apps/worker/src/boot-workers.ts's
 * `assertKnownQueue`): a stale or mistyped value fails boot loudly, naming
 * the offending value and the accepted set, instead of being silently
 * ignored or misinterpreted.
 */
function assertKnownRole(value: string): asserts value is Role {
  if ((ROLE_VALUES as readonly string[]).includes(value)) {
    return;
  }
  logger.fatal(
    { value, accepted: ROLE_VALUES },
    `ROLE: unknown value "${value}". Accepted values: ${ROLE_VALUES.join(', ')}.`
  );
  process.exit(1);
}

function resolveRole(): Role {
  const value = process.env.ROLE?.trim() || 'api';
  assertKnownRole(value);
  return value;
}

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

function buildDeps(): AppDeps {
  return {
    // db/ch/redis/clients/buffers are `unknown` stubs in context.ts until
    // P3/P4/P8 land the real clients — reading one before its type lands is
    // meant to be a compile error, not a runtime `undefined`.
    db: undefined,
    ch: undefined,
    redis: undefined,
    clients: undefined,
    buffers: undefined,
    producers: stubProducers(),
    logger,
    config: { selfHosted: process.env.SELF_HOSTED === 'true' },
  };
}

async function main() {
  const role = resolveRole();
  const port = Number.parseInt(
    process.env.API_PORT ?? String(DEFAULT_PORT),
    10
  );
  const deps = buildDeps();

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
