// V2 boot entrypoint (ADR-007 §7 "apps/api — three files"; TARGET_ARCHITECTURE
// §7 main.ts boot order). Runs on Bun; the V1 Fastify boot at `./index.ts`
// keeps serving the golden harness untouched until it is deleted at M9-004.
//
// THE ROLE TABLE (TARGET_ARCHITECTURE §7). One process, three shapes:
//
//   |                     | api | worker | all |
//   | ops HTTP + /metrics |  x  |   x    |  x  |
//   | producers           |  x  |   x    |  x  |
//   | BullMQ workers      |     |   x    |  x  |
//   | schedulers (cron)   |     |   x    |  x  |
//   | Kafka ingest        |     |   x    |  x  |
//   | initial salts       |     |   x    |  x  |
//   | bull-board          |     |   x    |  x  |
//   | queue/buffer/session scrape gauges |  | x | x |
//   | redis keyspace-notify |  x  |      |  x  |
//
// An unknown ROLE fails boot loudly, naming the value — `config/env.ts`.
// Inside a consuming role, ENABLED_QUEUES narrows *which* of the eight
// consumers start (cloud runs 4 replicas on `events` and 6 on the rest,
// docs/ANSWERS.md §1.3), and an unknown token there fails boot the same way.
//
// db/ch/clients are not on `AppDeps` yet — their types stay the `unknown`
// stubs `context.ts` declares until P3/P4 land the real clients — so the
// mounted HTTP surface is still ops-only; `dashboardRoutes`/`publicApiRoutes`
// land at M9-004. The buffers are real from M8-001, the producers from
// M9-001, and the workers/schedulers/consumer from here.

process.env.TZ = 'UTC';

import {
  type AppDeps,
  BULL_BOARD_BASE_PATH,
  type BufferDeps,
  bullBoardRoutes,
  createBuffers,
  createInitialSalts,
  createProducers,
  debugRoutes,
  enableEventsHeartbeat,
  incomingEvent,
  ingestConsumerMetrics,
  type KafkaConsumerHandle,
  loadIncomingEventDeps,
  markEventsActivity,
  opsRoutes,
  type QueueDefinition,
  type QueueProducerHandle,
  queueKey,
  queues,
  rawStderrWrite,
  registerBufferMetrics,
  registerDefaultMetrics,
  registerQueueMetrics,
  registerSessionScrapeMetrics,
  type SessionMetricsRedis,
  sessionEndEnqueueOptions,
  sessionEndJobPayload,
  setShuttingDown,
  startKafkaEventsConsumer,
  startSchedulers,
  startWorkers,
  type WorkerHandle,
} from '@openpanel/core';
import {
  assertKafkaConfigured,
  createKafkaEventsConsumer,
  KAFKA_EVENTS_TOPIC,
  KAFKA_HANDLER_MAX_ATTEMPTS,
  KAFKA_HANDLER_RETRY_INITIAL_MS,
  KAFKA_HANDLER_RETRY_MAX_MS,
  KAFKA_PARTITIONS_CONCURRENT,
  kafkaLogger,
  produceDeadLetterEvent,
  produceIncomingEvent,
} from '@openpanel/queue';
import { getRedisCache, getRedisPub, getRedisQueue } from '@openpanel/redis';
import pino from 'pino';
import {
  type Config,
  concurrencyOverride,
  isProduction,
  KAFKA_QUEUE_TOKEN,
  loadConfig,
} from './config/env';

// The registry key and the Redis name are the same string for all seven queues
// (jobs.registry.ts); `queueKey` only braces it under `QUEUE_CLUSTER`.
const CRON_QUEUE_NAME = 'cron';
// Used only to report a config error itself — the real level isn't known
// until `config/env.ts` has validated `LOG_LEVEL`.
const BOOTSTRAP_LOG_LEVEL = 'info';
// V1's cron drain bound (apps/worker/src/boot-workers.ts `waitForQueueToEmpty`).
const CRON_DRAIN_TIMEOUT_MS = 60_000;
const CRON_DRAIN_POLL_MS = 500;
const FATAL_EXIT_DELAY_MS = 1000;

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

/** ROLE=api produces and serves; it never consumes. */
const roleConsumes = config.ROLE !== 'api';
const workersEnabled = roleConsumes && !config.DISABLE_WORKERS;

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
    namespace: config.QUEUE_NAMESPACE,
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
  const cron = findBullQueue(producers, CRON_QUEUE_NAME);

  return {
    createLogger: (name) => logger.child({ name }),
    isCronPaused: async () => (cron ? await cron.isPaused() : false),
  };
}

/** `bullQueues` are keyed by the Redis name, which cluster/namespace decide. */
function findBullQueue(producers: QueueProducerHandle, name: string) {
  const key = queueKey(name, {
    cluster: config.QUEUE_CLUSTER,
    namespace: config.QUEUE_NAMESPACE,
  });
  return producers.bullQueues.find((queue) => queue.name === key);
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
    // it back (M8-002). It dies with that package at M9-003.
    produceIncomingEvent,
    logger,
    config: { selfHosted: config.SELF_HOSTED },
  };
}

/**
 * The queues this process consumes, `<QUEUE>_CONCURRENCY` applied.
 *
 * ENABLED_QUEUES is the same allowlist V1 read, and its `events` token selects
 * the Kafka consumer rather than a BullMQ queue — hence it is filtered out
 * here and asked about separately.
 */
function consumedQueues(): Record<string, QueueDefinition> {
  const enabled = new Set(config.ENABLED_QUEUES);
  const selected: Record<string, QueueDefinition> = {};

  for (const [name, definition] of Object.entries(queues)) {
    if (!enabled.has(name)) {
      continue;
    }
    const concurrency = concurrencyOverride(config, name);
    selected[name] =
      concurrency === undefined
        ? definition
        : { ...definition, worker: { ...definition.worker, concurrency } };
  }

  return selected;
}

/**
 * Every declared scheduler must have a handler on the `cron` queue, or its
 * tick enqueues a job the worker can only throw on. Reported at boot, once,
 * rather than discovered N minutes later in a failed-job list.
 */
function warnOnUnhandledSchedulers(schedulerIds: string[]): void {
  const handled = new Set(Object.keys(queues.cron.jobs));
  const missing = schedulerIds.filter((id) => !handled.has(id));
  if (missing.length > 0) {
    logger.error(
      { schedulers: missing },
      'cron schedulers have no handler on the cron queue — every tick will fail'
    );
  }
}

/**
 * The Kafka events consumer. The kafkajs client, the topic, the consumer
 * group, the DLQ producer and the retry bounds all come from
 * `@openpanel/queue`, which is what keeps those names byte-identical across
 * the cutover — core never spells one (see modules/ingest/src/consumer.ts).
 */
async function startIngestConsumer(
  deps: AppDeps
): Promise<KafkaConsumerHandle> {
  assertKafkaConfigured();
  enableEventsHeartbeat();

  const eventDeps = await loadIncomingEventDeps(logger, async (input) => {
    await deps.producers.queues.sessions.session.add(
      sessionEndJobPayload(input),
      sessionEndEnqueueOptions(input.closedSession.id)
    );
  });

  return await startKafkaEventsConsumer({
    createConsumer: createKafkaEventsConsumer,
    logger,
    kafkaLogger,
    topic: KAFKA_EVENTS_TOPIC,
    partitionsConsumedConcurrently: KAFKA_PARTITIONS_CONCURRENT,
    batch: {
      handleEvent: (payload, meta) => incomingEvent(payload, eventDeps, meta),
      sendToDeadLetter: produceDeadLetterEvent,
      logger,
      metrics: ingestConsumerMetrics,
      onActivity: markEventsActivity,
      maxAttempts: KAFKA_HANDLER_MAX_ATTEMPTS,
      initialRetryMs: KAFKA_HANDLER_RETRY_INITIAL_MS,
      maxRetryMs: KAFKA_HANDLER_RETRY_MAX_MS,
    },
  });
}

/**
 * V1's shutdown drain (apps/worker/src/boot-workers.ts): let the cron queue
 * finish what it started before closing the workers, because a cron job cut
 * in half comes back as a stalled retry. One of ADR-005's four sanctioned
 * `bullQueues` call sites.
 */
async function waitForCronToDrain(producers: QueueProducerHandle) {
  const cron = findBullQueue(producers, CRON_QUEUE_NAME);
  if (!cron) {
    return;
  }

  const startedAt = performance.now();
  while (true) {
    const active = await cron.getActiveCount();
    if (active === 0) {
      return;
    }
    if (performance.now() - startedAt > CRON_DRAIN_TIMEOUT_MS) {
      logger.warn(
        { queue: cron.name, remainingCount: active },
        'Timeout reached while waiting for queue to empty'
      );
      return;
    }
    logger.info({ queue: cron.name, count: active }, 'Waiting for queue');
    await new Promise((resolve) => setTimeout(resolve, CRON_DRAIN_POLL_MS));
  }
}

function registerConsumerMetrics(deps: AppDeps): void {
  // Scrape-time collectors register only where a role consumes: each is a
  // Redis round trip per scrape, and ten API replicas exposing them would
  // multiply that for no new information (TARGET_ARCHITECTURE §18).
  registerBufferMetrics(deps.buffers);
  registerQueueMetrics(deps.producers.bullQueues);
  registerSessionScrapeMetrics(
    () => getRedisCache() as unknown as SessionMetricsRedis
  );
}

async function buildHttpApp(deps: AppDeps) {
  const app = opsRoutes(deps);

  // Local-only: trigger a cron job on demand instead of waiting for its
  // schedule. Two conditions, both V1's: `NODE_ENV != production`, because it
  // is an unauthenticated "run anything now" surface, and a consuming role,
  // because in V1 these routes only ever existed on the worker.
  if (roleConsumes && !isProduction(config)) {
    app.use(debugRoutes(deps));
    logger.info('Debug routes enabled at /debug/cron');
  }

  if (roleConsumes && !config.DISABLE_BULLBOARD) {
    app.use(await bullBoardRoutes(deps, deps.producers.bullQueues));
    logger.info({ path: BULL_BOARD_BASE_PATH }, 'bull-board mounted');
  }

  return app;
}

/**
 * uncaughtException / unhandledRejection: the process state is corrupt, so log
 * and exit fast rather than draining through a poisoned process.
 *
 * Fatals are mirrored to the REAL stderr, bypassing the output interceptor:
 * the OTLP flush window is often lost on the way down, and `docker logs` must
 * always show why we died (V1 did this in both apps).
 *
 * Installed in every role. V1's api only did so in production and its worker
 * did so always; the merged process takes the worker's.
 */
function installFatalHandlers(): void {
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception — exiting');
    rawStderrWrite(`Uncaught exception — exiting: ${error?.stack ?? error}\n`);
    setShuttingDown(true);
    setTimeout(() => process.exit(1), FATAL_EXIT_DELAY_MS).unref();
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection — exiting');
    rawStderrWrite(
      `Unhandled rejection — exiting: ${
        reason instanceof Error ? reason.stack : String(reason)
      }\n`
    );
    setShuttingDown(true);
    setTimeout(() => process.exit(1), FATAL_EXIT_DELAY_MS).unref();
  });
}

async function main() {
  const role = config.ROLE;
  const deps = buildDeps();

  // HTTP and default metrics register everywhere (TARGET_ARCHITECTURE §18).
  registerDefaultMetrics();
  if (roleConsumes) {
    registerConsumerMetrics(deps);
  }

  const app = await buildHttpApp(deps);

  let workers: WorkerHandle | undefined;
  let consumer: KafkaConsumerHandle | undefined;

  if (workersEnabled) {
    const definitions = consumedQueues();
    workers = startWorkers({
      definitions,
      deps,
      // BullMQ duplicates this for each worker's blocking fetch; the queue
      // client itself stays packages/redis's singleton, as in V1.
      createConnection: () => getRedisQueue(),
      cluster: config.QUEUE_CLUSTER,
      namespace: config.QUEUE_NAMESPACE,
    });

    if (definitions[CRON_QUEUE_NAME]) {
      const cron = findBullQueue(deps.producers, CRON_QUEUE_NAME);
      if (cron) {
        await startSchedulers({
          queue: cron,
          flags: {
            selfHosted: config.SELF_HOSTED,
            production: isProduction(config),
          },
          logger,
        });
        warnOnUnhandledSchedulers(
          (await cron.getJobSchedulers()).map((scheduler) => scheduler.key)
        );
      }
    }

    if (config.ENABLED_QUEUES.includes(KAFKA_QUEUE_TOKEN)) {
      consumer = await startIngestConsumer(deps);
    }

    await createInitialSalts();
  } else if (roleConsumes) {
    logger.warn('Workers are disabled');
  }

  installFatalHandlers();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    // Readiness answers 503 from here on, so the load balancer stops sending
    // work before the drain below finishes rather than after.
    setShuttingDown(true);
    logger.info({ signal }, 'Starting graceful shutdown');

    const forceExit = setTimeout(() => {
      logger.error({ signal }, 'Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, config.SHUTDOWN_FORCE_EXIT_MS);
    forceExit.unref();

    try {
      await app.stop();
      // Only if THIS process consumes cron: waiting on a queue another replica
      // owns would stall the whole shutdown budget on someone else's jobs.
      if (workers && config.ENABLED_QUEUES.includes(CRON_QUEUE_NAME)) {
        await waitForCronToDrain(deps.producers);
      }
      await Promise.all([workers?.close(), consumer?.stop()]);
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

  // No `hostname` unless API_HOST says one: Bun's default is `0.0.0.0`, and
  // its `localhost` binds IPv6-only (see config/env.ts's API_HOST).
  const listen = config.API_HOST
    ? { port: config.API_PORT, hostname: config.API_HOST }
    : { port: config.API_PORT };
  app.listen(listen, () => {
    logger.info(
      { role, port: config.API_PORT, hostname: config.API_HOST ?? '0.0.0.0' },
      'API listening'
    );
  });

  // V1's api did this and its worker did not — the expiry notifications only
  // matter where something subscribes (apps/api/src/index.ts).
  if (role !== 'worker') {
    try {
      await getRedisPub().config('SET', 'notify-keyspace-events', 'Ex');
      logger.info({ role }, 'redis keyspace notifications configured');
    } catch (error) {
      logger.warn({ err: error }, 'Failed to set redis notify-keyspace-events');
      logger.warn(
        'If you use a managed Redis service, you may need to set this manually.'
      );
    }
  }
}

main();
