// The boot entrypoint. Runs on Bun; this is the only way the API starts, and
// `buildHttpApp` below mounts the whole HTTP surface.
//
// An unknown ROLE fails boot loudly, naming the value — `config/env.ts`.
// Inside a consuming role, ENABLED_QUEUES narrows *which* consumers start
// (cloud runs 4 replicas on `events` and 6 on the rest), and an unknown token
// there fails boot the same way.

// The only `process.env` touch outside config/env.ts, and a WRITE: it sets the
// process timezone. Every value the app READS comes from `loadConfig` below.
process.env.TZ = 'UTC';

import { createHmac } from 'node:crypto';
import {
  type AppDeps,
  appRouter,
  assertKafkaConfigured,
  BULL_BOARD_BASE_PATH,
  type BufferDeps,
  bullBoardRoutes,
  CRON_SCHEDULES,
  checkNotificationRulesForEvent,
  cookieOptions,
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
  disconnectKafka,
  enableEventsHeartbeat,
  errorHandler,
  type HttpCtx,
  ingestConsumerMetrics,
  type KafkaConsumerHandle,
  kafkaLogger,
  markEventsActivity,
  opsRoutes,
  publicApiRoutes,
  type QueueDefinition,
  type QueueProducerHandle,
  queueKey,
  queues,
  RPC_DEADLINE_MS,
  rawStderrWrite,
  registerBufferMetrics,
  registerDefaultMetrics,
  registerQueueMetrics,
  registerSessionScrapeMetrics,
  requestLogging,
  type SessionMetricsRedis,
  setShuttingDown,
  startKafkaEventsConsumer,
  startSchedulers,
  startWorkers,
  TRPC_ENDPOINT,
  type WorkerHandle,
} from '@openpanel/core';
import { ch } from '@openpanel/db/src/clickhouse/client';
import { db, Prisma } from '@openpanel/db/src/prisma-client';
import {
  createDeadLetterRecorder,
  createDuplicateEventMarker,
  getRedisCache,
  getRedisPub,
  getRedisQueue,
} from '@openpanel/redis';
import { Elysia } from 'elysia';
import pino from 'pino';
import { type Config, KAFKA_QUEUE_TOKEN, loadConfig } from './config/env';
import { runShutdownSequence } from './shutdown';

// The registry key and the Redis name are the same string for all seven queues
// (jobs.registry.ts); `queueKey` only braces it under `QUEUE_CLUSTER`.
const CRON_QUEUE_NAME = 'cron';
// Used only to report a config error itself — the real level isn't known
// until `config/env.ts` has validated `LOG_LEVEL`.
const BOOTSTRAP_LOG_LEVEL = 'info';
const CRON_DRAIN_TIMEOUT_MS = 60_000;
const CRON_DRAIN_POLL_MS = 500;
const FATAL_EXIT_DELAY_MS = 1000;
const MS_PER_SECOND = 1000;
// Set here because Elysia's Bun adapter otherwise injects `idleTimeout: 30`,
// which severed slow dashboard calls without a response. It must outlast the
// tRPC deadline so the deadline's error is delivered first; the margin covers
// the ~1.6 s event-loop stall measured at the end of a large drill-down plus
// Bun's up-to-1 s timer granularity.
const HTTP_IDLE_TIMEOUT_MARGIN_SECONDS = 10;
const HTTP_IDLE_TIMEOUT_SECONDS =
  RPC_DEADLINE_MS / MS_PER_SECOND + HTTP_IDLE_TIMEOUT_MARGIN_SECONDS;

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
/** Gates only the public API, dashboard and /trpc surfaces — bull-board,
 *  /debug/cron and /metrics are gated separately by `roleConsumes`. */
const roleServesHttp = config.ROLE !== 'worker';
const workersEnabled = roleConsumes && !config.DISABLE_WORKERS;

/**
 * The connection is `packages/redis`'s dedicated queue client: separate from
 * cache/pub/sub, with `maxRetriesPerRequest: null`, which BullMQ requires. It
 * stays that package's singleton to close; `producers.close` closes the
 * queues over it.
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
 * BullMQ read. Pausing `cron` from bull-board halts ALL buffer flushing —
 * preserved deliberately as an accepted trade-off.
 */
function bufferDeps(producers: QueueProducerHandle): BufferDeps {
  const cron = findBullQueue(producers, CRON_QUEUE_NAME);

  return {
    createLogger: (name) => logger.child({ name }),
    isCronPaused: async () => (cron ? await cron.isPaused() : false),
    config: config.core,
    // The boot scope's ClickHouse client, so a buffer flush logs under the same
    // client every service reaches as `deps.ch` instead of constructing its
    // own.
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
    // their own singletons and read their own env, so these are references
    // to those, not new connections: one Prisma client, one round-robin
    // ClickHouse client and the cache Redis, handed down so a service reaches
    // them through its request-scoped `Ctx` instead of importing them.
    db,
    // Prisma's two JSON sentinels, so the four modules that write a nullable
    // `Json?` column read them off the scope instead of importing the client.
    prisma: { DbNull: Prisma.DbNull, JsonNull: Prisma.JsonNull },
    ch,
    redis: getRedisCache(),
    clients: createClients(),
    buffers: createBuffers(bufferDeps(producers)),
    producers,
    logger,
    config: config.core,
  };
}

/**
 * The queues this process consumes, `<QUEUE>_CONCURRENCY` applied.
 *
 * ENABLED_QUEUES's `events` token selects the Kafka consumer rather than a
 * BullMQ queue — hence it is filtered out here and asked about separately.
 */
function consumedQueues(): Record<string, QueueDefinition> {
  const enabled = new Set(config.ENABLED_QUEUES);
  const selected: Record<string, QueueDefinition> = {};

  for (const [name, definition] of Object.entries(queues)) {
    if (!enabled.has(name)) {
      continue;
    }
    const concurrency = config.concurrency[name];
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
 * The Kafka events consumer. The kafkajs client, the topic, the consumer group,
 * the DLQ producer and the retry bounds all come from core's own
 * `modules/ingest/src/kafka.ts` — still passed in as arguments, so
 * `consumer.ts` spells none of those names itself.
 */
async function startIngestConsumer(
  deps: AppDeps
): Promise<KafkaConsumerHandle> {
  assertKafkaConfigured(config.core.kafka);
  enableEventsHeartbeat();

  return await startKafkaEventsConsumer({
    createConsumer: (options?: { groupId?: string }) =>
      createKafkaEventsConsumer(config.core, options),
    logger,
    kafkaLogger: kafkaLogger(config.core),
    topic: config.core.kafka.eventsTopic,
    partitionsConsumedConcurrently: config.core.kafka.partitionsConcurrent,
    batch: {
      // One Ctx per message, scoped to the requestId the producer stamped into
      // the envelope. The one binding a work scope cannot supply is resolved
      // here, once: the notification dispatch has no Ctx slot in its signature.
      handleEvent: createIncomingEventHandler(deps, {
        checkNotificationRulesForEvent,
        // MARKS a redelivery, never drops one — the event is inserted either
        // way. The CACHE client, again, and for the same reason: a handler
        // that blocks on Redis risks evicting the consumer past its session
        // timeout, and an eviction is what causes duplicate rows.
        markDuplicateEvent: createDuplicateEventMarker({
          client: deps.redis,
          ttlMs: config.INGEST_DUPLICATE_MARKER_TTL_MS,
        }),
      }),
      // A capped Redis list, and the event is DROPPED whether or not the
      // record lands. The Kafka DLQ it replaced (`produceDeadLetterEvent`,
      // still exported from core) produced to a topic nothing creates, and
      // every failure held the offset back — a redelivery loop. The CACHE
      // client, not the queue client: only that one fails fast, and failing
      // fast is the point here.
      sendToDeadLetter: createDeadLetterRecorder({
        client: deps.redis,
        maxEntries: config.INGEST_DEAD_LETTER_MAX_ENTRIES,
      }),
      // Opened before the batch's first handler and closed before its first
      // resolved offset; the gate THROWS if the rpush did not land.
      // `pendingEvents` is the only in-process buffer state in the tree —
      // every other buffer writes to Redis inside `add()`.
      openDurabilityWindow: () => deps.buffers.event.openDurabilityWindow(),
      logger,
      metrics: ingestConsumerMetrics,
      onActivity: markEventsActivity,
      maxAttempts: config.core.kafka.handlerMaxAttempts,
      initialRetryMs: config.core.kafka.handlerRetryInitialMs,
      maxRetryMs: config.core.kafka.handlerRetryMaxMs,
    },
  });
}

/**
 * Let the cron queue finish what it started before closing the workers,
 * because a cron job cut in half comes back as a stalled retry.
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
  // multiply that for no new information.
  registerBufferMetrics(deps.buffers);
  registerQueueMetrics(deps.producers.bullQueues);
  registerSessionScrapeMetrics(
    () => getRedisCache() as unknown as SessionMetricsRedis
  );
}

/**
 * The three cookies the GSC OAuth flow signs (gsc.rpc.ts's `signed: true`).
 * `signCookie` below produces the same `value.<b64 hmac>` form on the tRPC
 * side, which writes cookies through the fetch adapter's `resHeaders` rather
 * than through Elysia.
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
 * THE ROOT CHAIN ORDER IS THE CONTRACT: cors -> requestId -> timestamp -> ip,
 * before every route-level hook. `requestLogging` brings `requestContext` —
 * and therefore those three hooks — with it, and the error handler is
 * registered on the same root so it covers every scope below.
 *
 * `ROLE=worker` mounts NONE of the three URL surfaces: a worker replica
 * answering `/track` would take traffic no load balancer routes to it.
 */
async function buildHttpApp(deps: AppDeps) {
  const app = new Elysia({
    // Elysia throws on an empty `secrets`. A deployment without COOKIE_SECRET
    // therefore gets unsigned cookies rather than a dead process.
    cookie: config.COOKIE_SECRET
      ? { secrets: config.COOKIE_SECRET, sign: SIGNED_COOKIE_NAMES }
      : {},
  })
    .use(corsDelegator({ dashboardOrigins: config.dashboardOrigins }))
    .use(errorHandler(deps, { production: config.core.isProduction }))
    .use(requestLogging(deps, { verboseClientIds: config.verboseClientIds }))
    .use(opsRoutes(deps));

  if (roleServesHttp) {
    const trpc = createTrpcFetchHandler({
      router: appRouter,
      logger,
      cookieOptions: cookieOptions(config.core),
      ipHeaders: config.core.ipHeaders,
      simulateLatency: !config.core.isProduction,
      signCookie,
      demoMode: Boolean(config.core.demoUserId),
    });

    app
      .use(publicApiRoutes(deps))
      .use(dashboardRoutes(deps))
      // `.all('/trpc/*')`, never `/trpc/:path`: the fetch adapter derives the
      // procedure by `pathname.slice(endpoint.length)` and a batched request
      // puts commas in that segment.
      //
      // `parse: 'none'` is load-bearing: the adapter reads the body off the
      // `Request` itself, and Elysia's own body parsing would have consumed the
      // stream first — every tRPC mutation then fails with "Body already used".
      .all(
        `${TRPC_ENDPOINT}/*`,
        ({ request, ctx }: { request: Request; ctx: HttpCtx }) =>
          trpc(request, ctx),
        { parse: 'none' }
      );

    logger.info('Public API, dashboard and /trpc surfaces mounted');
  }

  // Local-only: trigger a cron job on demand instead of waiting for its
  // schedule. Gated by `NODE_ENV != production`, because it is an
  // unauthenticated "run anything now" surface, and by a consuming role,
  // since these routes only make sense there.
  if (roleConsumes && !config.core.isProduction) {
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
 * always show why we died.
 *
 * Installed in every role, always.
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

  // HTTP and default metrics register everywhere.
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
      // client itself stays packages/redis's singleton.
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
            selfHosted: config.core.selfHosted,
            production: config.core.isProduction,
          },
          logger,
          schedulers: CRON_SCHEDULES,
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

    const exitCode = await runShutdownSequence(
      {
        stopHttpServer: async () => {
          await app.stop();
        },
        drainCron: async () => {
          if (workers && config.ENABLED_QUEUES.includes(CRON_QUEUE_NAME)) {
            await waitForCronToDrain(deps.producers);
          }
        },
        closeWorkers: async () => {
          await workers?.close();
        },
        stopConsuming: async () => {
          await consumer?.stopConsuming();
        },
        // The backstop. Events buffered inside a Kafka batch are already in
        // Redis (the batch handler flushes before it resolves its offsets);
        // this catches what was buffered outside one — a session-end job's
        // `session_end` event, an import — which no offset covers.
        flushEventBuffer: () => deps.buffers.event.flushPendingOrThrow(),
        stopConsumer: async () => {
          await consumer?.stop();
        },
        closeProducers: () => deps.producers.close(),
        disconnectKafka: () => disconnectKafka(config.core),
      },
      logger
    );

    clearTimeout(forceExit);
    process.exit(exitCode);
  };

  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });

  const listenOptions = {
    ...config.listen,
    idleTimeout: HTTP_IDLE_TIMEOUT_SECONDS,
  };
  app.listen(listenOptions, () => {
    logger.info(
      {
        role,
        port: config.API_PORT,
        hostname: config.listen.hostname ?? '0.0.0.0',
        // The running Bun version, asserted against .bun-version by
        // scripts/doctor.sh — logged so a wrong-runtime incident is one log
        // line away rather than an inference.
        bunVersion: Bun.version,
      },
      'API listening'
    );
  });

  // The expiry notifications only matter where something subscribes.
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
