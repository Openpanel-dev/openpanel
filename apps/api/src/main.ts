// THE boot entrypoint (ADR-007 §7 "apps/api — three files"; TARGET_ARCHITECTURE
// §7 main.ts boot order). Runs on Bun. M9-004 deleted the V1 Fastify boot
// (`./index.ts` + `./app.ts`), so this file is the only way the API starts and
// `app.ts`'s mounting half lives in `buildHttpApp` below.
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
// THE MOUNTED SURFACE (M9-004). `AppDeps` now carries the real db, ClickHouse,
// Redis and outbound clients, and `buildHttpApp` hangs all four V1 scopes on
// one Bun.serve: the root chain (CORS -> requestId -> timestamp -> ip -> the
// error handler, in V1's order), the ops surface, the public API, the
// dashboard surface and `/trpc`. A role that only consumes serves none of the
// last three — V1's worker never did either.

process.env.TZ = 'UTC';

import { createHmac } from 'node:crypto';
import {
  type AppDeps,
  appRouter,
  assertKafkaConfigured,
  BULL_BOARD_BASE_PATH,
  type BufferDeps,
  bullBoardRoutes,
  COOKIE_OPTIONS,
  checkNotificationRulesForEvent,
  clearProjectByIdCache,
  corsDelegator,
  createBuffers,
  createClients,
  createIncomingEventHandler,
  createInitialSalts,
  createKafkaEventsConsumer,
  createProducers,
  createTrpcFetchHandler,
  dashboardRoutes,
  debugRoutes,
  enableEventsHeartbeat,
  errorHandler,
  getProjectByIdCached,
  type HttpCtx,
  ingestConsumerMetrics,
  KAFKA_EVENTS_TOPIC,
  KAFKA_HANDLER_MAX_ATTEMPTS,
  KAFKA_HANDLER_RETRY_INITIAL_MS,
  KAFKA_HANDLER_RETRY_MAX_MS,
  KAFKA_PARTITIONS_CONCURRENT,
  type KafkaConsumerHandle,
  kafkaLogger,
  markEventsActivity,
  opsRoutes,
  produceDeadLetterEvent,
  publicApiRoutes,
  type QueueDefinition,
  type QueueProducerHandle,
  queueKey,
  queues,
  rawStderrWrite,
  registerBufferMetrics,
  registerDefaultMetrics,
  registerQueueMetrics,
  registerSessionScrapeMetrics,
  requestLogging,
  type SessionMetricsRedis,
  setShuttingDown,
  setV1CompatServices,
  startKafkaEventsConsumer,
  startSchedulers,
  startWorkers,
  TRPC_ENDPOINT,
  V1_COMPAT_REQUEST_ID,
  type WorkerHandle,
} from '@openpanel/core';
import { ch } from '@openpanel/db/src/clickhouse/client';
import { db } from '@openpanel/db/src/prisma-client';
import { getRedisCache, getRedisPub, getRedisQueue } from '@openpanel/redis';
import { Elysia } from 'elysia';
import pino from 'pino';
import {
  type Config,
  concurrencyOverride,
  dashboardOrigins,
  isProduction,
  KAFKA_QUEUE_TOKEN,
  loadConfig,
  verboseClientIds,
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
/** ROLE=worker consumes and never serves a URL surface, exactly as V1's
 *  worker did (it ran bull-board, /debug/cron and /metrics, nothing else). */
const roleServesHttp = config.ROLE !== 'worker';
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
    // M10-009: the boot scope's ClickHouse client, so a buffer flush logs
    // under the same client every service reaches as `deps.ch` instead of
    // constructing its own (docs/TECH_DEBT.md §4).
    ch,
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
    // The four boot handles. `packages/db` and `packages/redis` still own
    // their own singletons and read their own env (ADR-007 §7's accepted
    // pragmatic deviation), so these are references to those, not new
    // connections: one Prisma client, one round-robin ClickHouse client and
    // the cache Redis, handed down so a service reaches them through its
    // request-scoped `Ctx` instead of importing them (TECH_DEBT §4).
    db,
    ch,
    redis: getRedisCache(),
    clients: createClients(),
    buffers: createBuffers(bufferDeps(producers)),
    producers,
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
 * The boot scope as `ServiceDeps`. `AppDeps` carries a `QueueProducerHandle`;
 * a service wants an already-scoped `QueueProducers`, and outside a request
 * there is nothing to correlate with, so the boot scope stamps
 * `V1_COMPAT_REQUEST_ID` (M10-005).
 */
function bootServiceDeps(
  deps: AppDeps
): Parameters<typeof setV1CompatServices>[0] {
  return {
    db: deps.db,
    ch: deps.ch,
    redis: deps.redis,
    clients: deps.clients,
    buffers: deps.buffers,
    logger: deps.logger,
    queues: deps.producers.scope({ requestId: V1_COMPAT_REQUEST_ID }),
  };
}

/**
 * The Kafka events consumer. The kafkajs client, the topic, the consumer
 * group, the DLQ producer and the retry bounds all come from core's own
 * `modules/ingest/src/kafka.ts` (M11-003) — still passed in as arguments, so
 * `consumer.ts` spells none of those names itself.
 */
async function startIngestConsumer(
  deps: AppDeps
): Promise<KafkaConsumerHandle> {
  assertKafkaConfigured();
  enableEventsHeartbeat();

  return await startKafkaEventsConsumer({
    createConsumer: createKafkaEventsConsumer,
    logger,
    kafkaLogger,
    topic: KAFKA_EVENTS_TOPIC,
    partitionsConsumedConcurrently: KAFKA_PARTITIONS_CONCURRENT,
    batch: {
      // One Ctx per message, scoped to the requestId the producer stamped
      // into the envelope (M10-006). The two bindings a work scope cannot
      // supply are resolved here, once: the notification dispatch has no Ctx
      // slot in its signature, and the project cache is the boot-registered
      // singleton ingest/http/mcp share.
      handleEvent: createIncomingEventHandler(deps, {
        checkNotificationRulesForEvent,
        getCachedProject: getProjectByIdCached,
        clearProjectCache: clearProjectByIdCache,
      }),
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

/**
 * The three cookies the GSC OAuth flow signs (gsc.rpc.ts's `signed: true`).
 * V1 signed them through `@fastify/cookie`'s `secret`; Elysia takes the same
 * list, and `signCookie` below produces the identical `value.<b64 hmac>` form
 * on the tRPC side, which writes cookies through the fetch adapter's
 * `resHeaders` rather than through Elysia (ADR-009 constraint 1).
 */
const SIGNED_COOKIE_NAMES = [
  'gsc_oauth_state',
  'gsc_code_verifier',
  'gsc_project_id',
];

const BASE64_TRAILING_PADDING = /=+$/;

/** Elysia's `signCookie` (dist/utils: HMAC-SHA256, base64, padding stripped),
 *  synchronously — `TrpcContextOptions.signCookie` is a sync signature. */
function signCookie(value: string): string {
  const signature = createHmac('sha256', config.COOKIE_SECRET)
    .update(value)
    .digest('base64')
    .replace(BASE64_TRAILING_PADDING, '');
  return `${value}.${signature}`;
}

/**
 * V1's `app.ts`, merged into the one entrypoint: the four Fastify scopes
 * become one Elysia tree.
 *
 * THE ROOT CHAIN ORDER IS THE CONTRACT (ADR-002 "behaviour that must be
 * preserved explicitly" 2): cors -> requestId -> timestamp -> ip, before every
 * route-level hook. `requestLogging` brings `requestContext` — and therefore
 * those three hooks — with it, and the error handler is registered on the same
 * root so it covers every scope below.
 *
 * `ROLE=worker` mounts NONE of the three URL surfaces: V1's worker served only
 * bull-board, the debug routes and `/metrics`, and a worker replica answering
 * `/track` would take traffic no load balancer routes to it.
 */
async function buildHttpApp(deps: AppDeps) {
  const app = new Elysia({
    // Elysia throws on an empty `secrets`, where V1 passed `secret: ''` to
    // @fastify/cookie and simply produced signatures nobody could rely on. A
    // deployment without COOKIE_SECRET therefore gets unsigned cookies rather
    // than a dead process — the same outcome V1 had, arrived at explicitly.
    cookie: config.COOKIE_SECRET
      ? { secrets: config.COOKIE_SECRET, sign: SIGNED_COOKIE_NAMES }
      : {},
  })
    .use(corsDelegator({ dashboardOrigins: dashboardOrigins(config) }))
    .use(errorHandler(deps, { production: isProduction(config) }))
    .use(requestLogging(deps, { verboseClientIds: verboseClientIds(config) }))
    .use(opsRoutes(deps));

  if (roleServesHttp) {
    const trpc = createTrpcFetchHandler({
      router: appRouter,
      logger,
      cookieOptions: COOKIE_OPTIONS,
      simulateLatency: !isProduction(config),
      signCookie,
      demoMode: Boolean(config.DEMO_USER_ID),
    });

    app
      .use(publicApiRoutes(deps))
      .use(dashboardRoutes(deps))
      // `.all('/trpc/*')`, never `/trpc/:path`: the fetch adapter derives the
      // procedure by `pathname.slice(endpoint.length)` and a batched request
      // puts commas in that segment (ADR-009).
      //
      // `parse: 'none'` is load-bearing: the adapter reads the body off the
      // `Request` itself, and Elysia's own body parsing would have consumed
      // the stream first — every tRPC mutation then fails with
      // "Body already used".
      .all(
        `${TRPC_ENDPOINT}/*`,
        ({ request, ctx }: { request: Request; ctx: HttpCtx }) =>
          trpc(request, ctx),
        { parse: 'none' }
      );

    logger.info('Public API, dashboard and /trpc surfaces mounted');
  }

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

  // The V1 compat seam (core/src/v1-compat.ts): `packages/trpc`'s routers and
  // the mcp/assistant tool runtimes reach core's modules as bare barrel
  // exports with no `Ctx`, so the deps built above are registered once here
  // for them. Everything with a `Ctx` uses `ctx.services.*`. Deleted with
  // `packages/trpc` at P10.
  setV1CompatServices(bootServiceDeps(deps));

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

    await createInitialSalts(deps);
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
