// The sole `process.env` READER on the V2 boot path, and since M15-006 that is
// true rather than aspirational: `packages/core` reads none (ADR-022 R7), so
// every variable core used to read itself is parsed here and travels down as
// `AppDeps.config` (`CoreConfig`). The one other `process.env` touch on the
// path is `main.ts`'s `process.env.TZ = 'UTC'` write, which sets the process's
// timezone rather than reading configuration. `packages/db` and
// `packages/redis` keep reading their own connection env until they grow
// factories — an accepted pragmatic deviation (ADR-007 §7).
//
// The shape is ADR-022 R17's, in this order:
//   1. one zod object over the raw environment;
//   2. every cross-field invariant as a `.superRefine` BEFORE the transform,
//      so a contradiction is named at boot rather than discovered at runtime;
//   3. one `.transform` that computes every derived value — URLs, namespaces,
//      IS_PRODUCTION, the listen address, the concurrency map — so nothing
//      downstream re-derives one;
//   4. `loadConfig(source = process.env)`, so a test hands in a minimal object.
//
// A blank `KEY=` is absent everywhere: `blankToUndefined` runs in front of
// every field, so `.default()` fires on an empty value exactly as it does on
// an unset one.
//
// Invalid config fails boot loudly, with every issue reported at once — never
// a fail-fast on the first bad var. Two classes, deliberately different:
//   - boot-critical values (roles, queues, Kafka wiring) FAIL;
//   - tuning knobs (batch sizes, limits, TTLs) fall back to the module's own
//     documented default on a malformed value, which is what the modules did
//     when they parsed these themselves.

import type { CoreConfig, KafkaSaslMechanism } from '@openpanel/core';
import { KAFKA_SASL_MECHANISMS, queues } from '@openpanel/core';
import { z } from 'zod';

export const ROLE_VALUES = ['api', 'worker', 'all'] as const;
export type Role = (typeof ROLE_VALUES)[number];

const DEFAULT_API_PORT = 3000;
const DEFAULT_LOG_LEVEL = 'info';
const TRUE_STRING = 'true';
const ONE_STRING = '1';
const FALSE_STRING = 'false';
const PRODUCTION = 'production';
const DEVELOPMENT = 'development';
/** pino's own service-name suffix when NODE_ENV is unset. */
const DEFAULT_SERVICE_ENVIRONMENT = 'dev';
/** V1's worker deadline (apps/worker/src/boot-workers.ts). */
const DEFAULT_SHUTDOWN_FORCE_EXIT_MS = 20_000;

const DEFAULT_KAFKA_CLIENT_ID = 'openpanel';
const DEFAULT_KAFKA_EVENTS_TOPIC = 'events';
const DEFAULT_KAFKA_CONSUMER_GROUP = 'openpanel-events';
const DEFAULT_KAFKA_PARTITIONS_CONCURRENT = 8;
const DEFAULT_KAFKA_MIN_MESSAGES = 1;
const DEFAULT_KAFKA_MAX_WAIT_MS = 500;
const DEFAULT_KAFKA_MAX_MESSAGES_PER_PARTITION = 256;
const DEFAULT_KAFKA_SESSION_TIMEOUT_MS = 30_000;
const DEFAULT_KAFKA_HEARTBEAT_INTERVAL_MS = 3000;
const DEFAULT_KAFKA_REQUEST_TIMEOUT_MS = 5000;
const DEFAULT_KAFKA_CONNECTION_TIMEOUT_MS = 2000;
const DEFAULT_KAFKA_PRODUCER_RETRIES = 2;
const DEFAULT_KAFKA_PRODUCER_INITIAL_RETRY_MS = 100;
const DEFAULT_KAFKA_PRODUCER_MAX_RETRY_MS = 1000;
/**
 * One produce round-trip at a time. ADR-023 rejects raising this: measured at
 * +2-3%, i.e. noise, for a documented reordering hazard.
 */
const DEFAULT_KAFKA_PRODUCER_MAX_IN_FLIGHT = 1;
/** Messages per `send()`. ADR-023: batching on; the win is flat above 25. */
const DEFAULT_KAFKA_PRODUCER_BATCH_SIZE = 25;
/**
 * A partial batch's maximum wait. The linger is added to the request's own
 * response time, so ADR-023 takes 5 ms (82% of the available gain) over the
 * 25 ms that would roughly double a quiet install's ingest latency.
 */
const DEFAULT_KAFKA_PRODUCER_BATCH_LINGER_MS = 5;
const DEFAULT_KAFKA_HANDLER_MAX_ATTEMPTS = 3;
/**
 * How many dead-lettered events the capped Redis list keeps (M20-001). A
 * debugging sample, not a recovery mechanism — the volume is in
 * `kafka_events_dead_lettered_total`. Carl's "only keep the last N events".
 */
const DEFAULT_INGEST_DEAD_LETTER_MAX_ENTRIES = 1000;
const DEFAULT_KAFKA_HANDLER_RETRY_INITIAL_MS = 100;
const DEFAULT_KAFKA_HANDLER_RETRY_MAX_MS = 1000;
const DEFAULT_KAFKA_SASL_MECHANISM: KafkaSaslMechanism = 'scram-sha-512';

/**
 * How long a duplicate marker outlives its event (M21-001). It only has to
 * outlive the REPLAY window, not the data: drill 08's eviction rejoin — the
 * one reassignment that costs duplicate rows — was 3,094 ms, and drill 06's
 * lost-ACK replay landed ~30 s after the produce. Two minutes is ~40x the
 * first and 4x the second, and covers a process restart resuming from its last
 * committed offset.
 *
 * It is the knob that decides the key count, which is `events/s x TTL`: at the
 * 5,000 events/s the scaling requirement targets that is 600,000 live markers.
 * Measured on this box's Redis 2026-09-14 — 200,000 real markers cost
 * 137.6 bytes each including the expires dict — so ~79 MB. Longer is only
 * worth buying if a redelivery window longer than this is ever observed.
 */
const DEFAULT_INGEST_DUPLICATE_MARKER_TTL_MS = 120_000;

/**
 * The Kafka events consumer's token. Renamed from `events_kafka` — there is
 * one events transport now, so there is one token for it (ADR-004 rec 5/6,
 * docs/ANSWERS.md §1.3). Carl updates the cloud env at cutover, which is why
 * the old spelling gets its own message below rather than being aliased.
 */
export const KAFKA_QUEUE_TOKEN = 'events';

/** `events` plus the seven registry keys, read from the registry itself so
 *  the accepted set cannot drift from what actually exists. */
export const ENABLED_QUEUE_VALUES = [
  KAFKA_QUEUE_TOKEN,
  ...Object.keys(queues),
] as const;

export type EnabledQueue = (typeof ENABLED_QUEUE_VALUES)[number];

const RENAMED_QUEUE_TOKENS: Record<string, string> = {
  events_kafka: KAFKA_QUEUE_TOKEN,
};

/** V1's `getConcurrencyFor` key derivation, verbatim — `cohortCompute` keeps
 *  reading `COHORTCOMPUTE_CONCURRENCY` (ADR-005 acceptance note: no rename). */
const NON_ENV_KEY_CHARS = /[^A-Z0-9]/g;

export function concurrencyEnvKey(queueName: string): string {
  return `${queueName.toUpperCase().replace(NON_ENV_KEY_CHARS, '_')}_CONCURRENCY`;
}

// An unset or blank var falls through to the default, matching the
// `value?.trim() || fallback` idiom the ported reads used before this file
// existed — `.default()` alone only fires on `undefined`, not `""`.
function blankToUndefined(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function splitTokens(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return value
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

// --- field schemas ----------------------------------------------------------

const optionalString = z.preprocess(blankToUndefined, z.string().optional());

const stringWithDefault = (fallback: string) =>
  z.preprocess(blankToUndefined, z.string().default(fallback));

/** `KEY=true` or `KEY=1`. The two spellings V1 accepted interchangeably. */
const trueOrOneSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .optional()
    .transform((value) => value === TRUE_STRING || value === ONE_STRING)
);

/**
 * `true`/`1` or `false`/`0`, `undefined` when unset. Anything else fails boot:
 * these switch TLS on a broker connection, where a typo must not silently
 * mean "off".
 */
const strictOptionalBoolean = z.preprocess(
  blankToUndefined,
  z
    .string()
    .optional()
    .superRefine((value, ctx) => {
      if (value === undefined || STRICT_BOOLEAN_STRINGS.has(value)) {
        return;
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `must be "true" or "false" (got "${value}")`,
      });
    })
    .transform((value) =>
      value === undefined
        ? undefined
        : value === TRUE_STRING || value === ONE_STRING
    )
);

/** Case-insensitive; an unknown mechanism fails boot before a client exists. */
const kafkaSaslMechanismSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .optional()
    .transform((value) => value?.toLowerCase())
    .superRefine((value, ctx) => {
      if (
        value === undefined ||
        (KAFKA_SASL_MECHANISMS as readonly string[]).includes(value)
      ) {
        return;
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported KAFKA_SASL_MECHANISM "${value}". Supported: ${KAFKA_SASL_MECHANISMS.join(', ')}`,
      });
    })
    .transform((value) => value as KafkaSaslMechanism | undefined)
);

/** Any defined value means on — V1's spelling for DISABLE_WORKERS. */
const definedIsTrueSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .optional()
    .transform((value) => value !== undefined)
);

const ZERO_STRING = '0';
const STRICT_BOOLEAN_STRINGS = new Set([
  TRUE_STRING,
  ONE_STRING,
  FALSE_STRING,
  ZERO_STRING,
]);

/** On unless explicitly switched off with `false` or `0`. */
const onUnlessDisabledSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .optional()
    .transform((value) => value !== FALSE_STRING && value !== ZERO_STRING)
);

/** On unless explicitly `0` — the session reaper/vacuum kill switches. */
const onUnlessZeroSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .optional()
    .transform((value) => value !== ZERO_STRING)
);

/**
 * A tuning knob: a positive integer, or `undefined` when unset OR malformed.
 * Malformed keeps the module's own default rather than failing boot — `-1`,
 * `0` and `5000junk` all land on `undefined`, which is what the hand-rolled
 * `parsePositiveInt` guards in `cohort.service.ts` and `lookback.ts` did.
 */
const optionalPositiveInt = z.preprocess(
  blankToUndefined,
  z.coerce.number().int().positive().optional().catch(undefined)
);

/** A boot-critical integer: a bad value fails boot instead of becoming NaN. */
const positiveIntWithDefault = (fallback: number) =>
  z.preprocess(
    blankToUndefined,
    z.coerce.number().int().positive().default(fallback)
  );

/** Comma-separated list; `undefined` when unset so the caller's order stands. */
const optionalTokenList = z.preprocess(
  blankToUndefined,
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined ? undefined : splitTokens(value)
    )
);

const tokenList = z.preprocess(
  blankToUndefined,
  z
    .string()
    .optional()
    .transform((value) => splitTokens(value))
);

/**
 * Same doctrine as `ENABLED_QUEUES` (apps/worker/src/boot-workers.ts's
 * `assertKnownQueue`): a stale or mistyped value fails boot loudly, naming
 * both the offending value and the accepted set.
 */
const roleSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .default('api')
    .superRefine((value, ctx) => {
      if (!(ROLE_VALUES as readonly string[]).includes(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `ROLE: unknown value "${value}". Accepted values: ${ROLE_VALUES.join(', ')}.`,
        });
      }
    })
    // Refine before transform (ADR-022 R17): the cast is only ever observed
    // once the refinement above has already accepted the value.
    .transform((value) => value as Role)
);

/**
 * Same doctrine as ROLE: an unknown token fails boot loudly rather than
 * leaving a worker silently idle (V1 ignored it — boot-workers.ts:78-87 —
 * which docs/ANSWERS.md §1.3 rules must change). Unset means all of them.
 */
const enabledQueuesSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .optional()
    .superRefine((value, ctx) => {
      if (value === undefined) {
        return;
      }
      for (const token of splitTokens(value)) {
        if ((ENABLED_QUEUE_VALUES as readonly string[]).includes(token)) {
          continue;
        }
        const renamedTo = RENAMED_QUEUE_TOKENS[token];
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: renamedTo
            ? `ENABLED_QUEUES: "${token}" was renamed to "${renamedTo}" — update ENABLED_QUEUES to use the new name.`
            : `ENABLED_QUEUES: unknown queue "${token}". Accepted values: ${ENABLED_QUEUE_VALUES.join(', ')}.`,
        });
      }
    })
    .transform((value) =>
      value === undefined
        ? [...ENABLED_QUEUE_VALUES]
        : (splitTokens(value) as EnabledQueue[])
    )
);

/** One `<QUEUE>_CONCURRENCY` slot per registry queue. V1 ignored a
 *  non-numeric or non-positive value and kept the default; so does this. */
const concurrencyShape = Object.fromEntries(
  Object.keys(queues).map((name) => [
    concurrencyEnvKey(name),
    optionalPositiveInt,
  ])
) as Record<string, typeof optionalPositiveInt>;

const rawSchema = z.object({
  ...concurrencyShape,

  // --- process / boot ---
  ROLE: roleSchema,
  NODE_ENV: optionalString,
  LOG_LEVEL: stringWithDefault(DEFAULT_LOG_LEVEL),
  API_PORT: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(0).default(DEFAULT_API_PORT)
  ),
  /**
   * Left UNSET means Bun's own default, `0.0.0.0`.
   *
   * Deliberate deviation from V1, which defaulted to `localhost` outside
   * production (apps/api/src/index.ts): `Bun.serve({hostname:'localhost'})`
   * binds `::1` ONLY, so a dev box's `127.0.0.1` request is refused. Making
   * the loopback-only bind explicit rather than the accidental default is
   * what keeps `bun run src/main.ts` reachable the way `node dist/index.js`
   * was.
   */
  API_HOST: optionalString,
  /**
   * One truthiness rule for the whole tree (M15-006). Core used to read this
   * three different ways — `=== 'true'`, `'true' || '1'`, and any truthy
   * string — so a `SELF_HOSTED=1` deployment got the SSRF guard dropped but
   * kept the cloud-only cron jobs. `true` or `1`, everywhere.
   */
  SELF_HOSTED: trueOrOneSchema,
  SHUTDOWN_FORCE_EXIT_MS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().positive().default(DEFAULT_SHUTDOWN_FORCE_EXIT_MS)
  ),

  // --- queues ---
  /**
   * Redis Cluster hash-tags every queue key (`cron` -> `{cron}`). Read here
   * because `main.ts` hands it to `createProducers`, and it decides a Redis
   * key name: set it on a deployment whose queues already exist unbraced and
   * every one of them is orphaned. V1 read it as a bare truthy check
   * (`packages/queue/src/queues.ts` `getQueueName`); a blank value is unset,
   * exactly as before.
   */
  QUEUE_CLUSTER: definedIsTrueSchema,
  /**
   * Isolates two deployments — or a proof run and the dev box — sharing one
   * Redis (`queueKey`'s `namespace`). UNSET in every real deployment: setting
   * it renames every queue key, which orphans the jobs already in Redis.
   */
  QUEUE_NAMESPACE: optionalString,
  ENABLED_QUEUES: enabledQueuesSchema,
  DISABLE_WORKERS: definedIsTrueSchema,
  DISABLE_BULLBOARD: trueOrOneSchema,

  // --- HTTP surface ---
  /**
   * The CORS delegator's allowlist (apps/api/src/app.ts:107-110): the
   * dashboard's own origin plus any extra comma-separated ones. Read once at
   * boot, exactly as V1 did — changing an origin has always needed a restart.
   */
  DASHBOARD_URL: optionalString,
  API_CORS_ORIGINS: optionalString,
  /**
   * Signs the three GSC OAuth cookies. Always set in a real deployment
   * (docs/ANSWERS.md §1.5); an unset value degrades to V1's `?? ''`.
   */
  COOKIE_SECRET: z.preprocess(
    blankToUndefined,
    z.string().optional().default('')
  ),
  /** Set on the demo deployment only. `validateSessionToken` short-circuits on
   *  it, and `enforceAccess` bans mutations for it. */
  DEMO_USER_ID: optionalString,
  /** V1's `requestLoggingHook`: the client ids whose requests log ip/UA. */
  ENABLE_VERBOSE_LOGGING: optionalString,

  // --- logging ---
  LOG_SILENT: trueOrOneSchema,
  LOG_EXPORTER: z.preprocess(
    blankToUndefined,
    z.enum(['otlp', 'stdout']).optional()
  ),
  LOG_PREFIX: optionalString,
  HYPERDX_API_KEY: optionalString,

  // --- storage / crypto ---
  CLICKHOUSE_CLUSTER: trueOrOneSchema,
  ENCRYPTION_KEY: optionalString,

  // --- auth ---
  ALLOW_REGISTRATION: optionalString,
  ALLOW_INVITATION: optionalString,
  GITHUB_CLIENT_ID: stringWithDefault(''),
  GITHUB_CLIENT_SECRET: stringWithDefault(''),
  GITHUB_REDIRECT_URI: stringWithDefault(''),
  GOOGLE_CLIENT_ID: stringWithDefault(''),
  GOOGLE_CLIENT_SECRET: stringWithDefault(''),
  GOOGLE_REDIRECT_URI: stringWithDefault(''),
  GSC_GOOGLE_REDIRECT_URI: stringWithDefault(''),
  COOKIE_TLDS: tokenList,
  CUSTOM_COOKIE_DOMAIN: optionalString,

  // --- outbound providers ---
  OPENAI_API_KEY: optionalString,
  OPENAI_BASE_URL: optionalString,
  OPENAI_PROJECT: optionalString,
  OPENAI_ORGANIZATION: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_BASE_URL: optionalString,
  ANTHROPIC_TOKEN: optionalString,
  ANTHROPIC_VERSION: optionalString,
  SLACK_CLIENT_ID: optionalString,
  SLACK_CLIENT_SECRET: optionalString,
  SLACK_OAUTH_REDIRECT_URL: optionalString,
  SLACK_STATE_SECRET: optionalString,
  POLAR_SAVE_DISCOUNT_ID: optionalString,
  POLAR_WEBHOOK_SECRET: optionalString,
  GCS_API_ENDPOINT: optionalString,
  DISABLE_PING: definedIsTrueSchema,

  // --- kafka ---
  KAFKA_CLIENT_ID: stringWithDefault(DEFAULT_KAFKA_CLIENT_ID),
  KAFKA_BROKERS: tokenList,
  KAFKA_EVENTS_TOPIC: stringWithDefault(DEFAULT_KAFKA_EVENTS_TOPIC),
  KAFKA_EVENTS_DLQ_TOPIC: optionalString,
  KAFKA_CONSUMER_GROUP: stringWithDefault(DEFAULT_KAFKA_CONSUMER_GROUP),
  KAFKA_PARTITIONS_CONCURRENT: positiveIntWithDefault(
    DEFAULT_KAFKA_PARTITIONS_CONCURRENT
  ),
  KAFKA_MIN_MESSAGES: positiveIntWithDefault(DEFAULT_KAFKA_MIN_MESSAGES),
  KAFKA_MAX_WAIT_MS: positiveIntWithDefault(DEFAULT_KAFKA_MAX_WAIT_MS),
  KAFKA_MAX_MESSAGES_PER_PARTITION: positiveIntWithDefault(
    DEFAULT_KAFKA_MAX_MESSAGES_PER_PARTITION
  ),
  KAFKA_SESSION_TIMEOUT_MS: positiveIntWithDefault(
    DEFAULT_KAFKA_SESSION_TIMEOUT_MS
  ),
  KAFKA_HEARTBEAT_INTERVAL_MS: positiveIntWithDefault(
    DEFAULT_KAFKA_HEARTBEAT_INTERVAL_MS
  ),
  KAFKA_REQUEST_TIMEOUT_MS: positiveIntWithDefault(
    DEFAULT_KAFKA_REQUEST_TIMEOUT_MS
  ),
  KAFKA_CONNECTION_TIMEOUT_MS: positiveIntWithDefault(
    DEFAULT_KAFKA_CONNECTION_TIMEOUT_MS
  ),
  KAFKA_PRODUCER_RETRIES: positiveIntWithDefault(
    DEFAULT_KAFKA_PRODUCER_RETRIES
  ),
  KAFKA_PRODUCER_INITIAL_RETRY_MS: positiveIntWithDefault(
    DEFAULT_KAFKA_PRODUCER_INITIAL_RETRY_MS
  ),
  KAFKA_PRODUCER_MAX_RETRY_MS: positiveIntWithDefault(
    DEFAULT_KAFKA_PRODUCER_MAX_RETRY_MS
  ),
  KAFKA_PRODUCER_MAX_IN_FLIGHT: positiveIntWithDefault(
    DEFAULT_KAFKA_PRODUCER_MAX_IN_FLIGHT
  ),
  KAFKA_PRODUCER_BATCH_SIZE: positiveIntWithDefault(
    DEFAULT_KAFKA_PRODUCER_BATCH_SIZE
  ),
  KAFKA_PRODUCER_BATCH_LINGER_MS: positiveIntWithDefault(
    DEFAULT_KAFKA_PRODUCER_BATCH_LINGER_MS
  ),
  KAFKA_HANDLER_MAX_ATTEMPTS: positiveIntWithDefault(
    DEFAULT_KAFKA_HANDLER_MAX_ATTEMPTS
  ),
  KAFKA_HANDLER_RETRY_INITIAL_MS: positiveIntWithDefault(
    DEFAULT_KAFKA_HANDLER_RETRY_INITIAL_MS
  ),
  KAFKA_HANDLER_RETRY_MAX_MS: positiveIntWithDefault(
    DEFAULT_KAFKA_HANDLER_RETRY_MAX_MS
  ),
  /** TLS/SASL for an external broker; unauthenticated plaintext when unset. */
  KAFKA_SSL: strictOptionalBoolean,
  KAFKA_SSL_CA_PATH: optionalString,
  KAFKA_SSL_REJECT_UNAUTHORIZED: strictOptionalBoolean,
  KAFKA_SASL_USERNAME: optionalString,
  KAFKA_SASL_PASSWORD: optionalString,
  KAFKA_SASL_MECHANISM: kafkaSaslMechanismSchema,

  // --- ingest dead-letter ---
  INGEST_DEAD_LETTER_MAX_ENTRIES: positiveIntWithDefault(
    DEFAULT_INGEST_DEAD_LETTER_MAX_ENTRIES
  ),

  // --- ingest duplicate marker ---
  INGEST_DUPLICATE_MARKER_TTL_MS: positiveIntWithDefault(
    DEFAULT_INGEST_DUPLICATE_MARKER_TTL_MS
  ),

  // --- buffers ---
  BUFFER_ASYNC_INSERTS: definedIsTrueSchema,
  BUFFER_CH_INSERT_CONCURRENCY: optionalPositiveInt,
  BOT_BUFFER_BATCH_SIZE: optionalPositiveInt,
  EVENT_BUFFER_BATCH_SIZE: optionalPositiveInt,
  EVENT_BUFFER_CHUNK_SIZE: optionalPositiveInt,
  EVENT_BUFFER_MICRO_BATCH_MS: optionalPositiveInt,
  EVENT_BUFFER_MICRO_BATCH_SIZE: optionalPositiveInt,
  GROUP_BUFFER_BATCH_SIZE: optionalPositiveInt,
  GROUP_BUFFER_CHUNK_SIZE: optionalPositiveInt,
  GROUP_BUFFER_TTL_IN_SECONDS: optionalPositiveInt,
  PROFILE_BUFFER_BATCH_SIZE: optionalPositiveInt,
  PROFILE_BUFFER_CHUNK_SIZE: optionalPositiveInt,
  PROFILE_BUFFER_TTL_IN_SECONDS: optionalPositiveInt,
  PROFILE_BUFFER_FETCH_CHUNK_SIZE: optionalPositiveInt,
  PROFILE_BACKFILL_BUFFER_BATCH_SIZE: optionalPositiveInt,
  REPLAY_BUFFER_BATCH_SIZE: optionalPositiveInt,
  REPLAY_BUFFER_CHUNK_SIZE: optionalPositiveInt,
  SESSION_BUFFER_BATCH_SIZE: optionalPositiveInt,
  SESSION_BUFFER_CHUNK_SIZE: optionalPositiveInt,
  SESSION_BUFFER_SQUASH: onUnlessDisabledSchema,

  // --- sessions ---
  SESSION_TIMEOUT_MS: optionalPositiveInt,
  SESSION_REAPER: onUnlessZeroSchema,
  SESSION_REAPER_BATCH_SIZE: optionalPositiveInt,
  SESSION_REAPER_WALLCLOCK_DEADMAN_MS: optionalPositiveInt,
  SESSION_VACUUM: onUnlessZeroSchema,
  SESSION_VACUUM_BATCH_SIZE: optionalPositiveInt,
  SESSION_VACUUM_STALE_THRESHOLD_MS: optionalPositiveInt,
  EXPERIMENTAL_PROFILE_BACKFILL: z.preprocess(
    blankToUndefined,
    z
      .string()
      .optional()
      .transform((value) => value === ONE_STRING)
  ),
  EXPERIMENTAL_PROFILE_BACKFILL_PROJECTS: tokenList,

  // --- query sizing ---
  EVENT_PROPERTY_VALUE_AUTOCOMPLETE_LIMIT: optionalPositiveInt,
  COHORT_MATERIALIZE_LIMIT: optionalPositiveInt,
  COHORT_QUERY_MEMORY_LIMIT_BYTES: optionalPositiveInt,
  COHORT_QUERY_SPILL_BYTES: optionalPositiveInt,
  EVENT_LIST_MAX_LOOKBACK_DAYS: optionalPositiveInt,
  SESSION_LIST_MAX_LOOKBACK_DAYS: optionalPositiveInt,
  IMPORT_BATCH_SIZE: optionalPositiveInt,
  INSIGHTS_RETENTION_DAYS: optionalPositiveInt,
  WIND_DOWN_MAX_PER_RUN: optionalPositiveInt,
  FUNNEL_NON_STRICT_ORDERING: trueOrOneSchema,

  // --- object-store export ---
  EXPORT_LAG_SECONDS: optionalPositiveInt,
  EXPORT_BATCH_SIZE: optionalPositiveInt,
  EXPORT_MAX_BATCHES_PER_RUN: optionalPositiveInt,
  EXPORT_CONCURRENCY: optionalPositiveInt,

  // --- request IP resolution ---
  IP_HEADER_ORDER: optionalTokenList,
  TRUSTED_IP_HEADER_ORDER: optionalTokenList,
});

type RawEnv = z.infer<typeof rawSchema>;

// --- cross-field invariants -------------------------------------------------

/** A role that consumes must have something to consume. */
function checkRoleConsumesSomething(raw: RawEnv, ctx: z.RefinementCtx): void {
  if (raw.ROLE === 'api' || raw.ENABLED_QUEUES.length > 0) {
    return;
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: `ROLE=${raw.ROLE} consumes queues but ENABLED_QUEUES names none — this process would boot and do nothing.`,
  });
}

/** `LOG_EXPORTER=otlp` ships through the HyperDX transport, which needs a key. */
function checkOtlpHasKey(raw: RawEnv, ctx: z.RefinementCtx): void {
  if (raw.LOG_EXPORTER !== 'otlp' || raw.HYPERDX_API_KEY !== undefined) {
    return;
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message:
      'LOG_EXPORTER=otlp requires HYPERDX_API_KEY — without it pino has no transport and every log line is dropped.',
  });
}

/** kafkajs evicts a consumer that cannot heartbeat inside its session. */
function checkKafkaHeartbeatFitsSession(
  raw: RawEnv,
  ctx: z.RefinementCtx
): void {
  if (raw.KAFKA_HEARTBEAT_INTERVAL_MS < raw.KAFKA_SESSION_TIMEOUT_MS) {
    return;
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: `KAFKA_HEARTBEAT_INTERVAL_MS (${raw.KAFKA_HEARTBEAT_INTERVAL_MS}) must be below KAFKA_SESSION_TIMEOUT_MS (${raw.KAFKA_SESSION_TIMEOUT_MS}) — otherwise every consumer is evicted before its first heartbeat.`,
  });
}

/** SASL credentials go over TLS unless KAFKA_SSL=false opts out explicitly. */
function kafkaSslEnabled(raw: RawEnv): boolean {
  const saslEnabled =
    raw.KAFKA_SASL_USERNAME !== undefined ||
    raw.KAFKA_SASL_PASSWORD !== undefined;
  return raw.KAFKA_SSL ?? saslEnabled;
}

/** Half a credential pair, or a mechanism with none, is a misconfiguration. */
function checkKafkaSaslIsComplete(raw: RawEnv, ctx: z.RefinementCtx): void {
  const hasUsername = raw.KAFKA_SASL_USERNAME !== undefined;
  const hasPassword = raw.KAFKA_SASL_PASSWORD !== undefined;
  if (hasUsername && hasPassword) {
    return;
  }
  if (hasUsername || hasPassword) {
    const missing = hasUsername ? 'KAFKA_SASL_PASSWORD' : 'KAFKA_SASL_USERNAME';
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Kafka SASL is partially configured: ${missing} is missing (both KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD are required)`,
    });
    return;
  }
  if (raw.KAFKA_SASL_MECHANISM !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'KAFKA_SASL_MECHANISM is set but KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD are missing',
    });
  }
}

/** A CA or a verification switch on a plaintext connection does nothing. */
function checkKafkaTlsOptionsHaveTls(raw: RawEnv, ctx: z.RefinementCtx): void {
  const hasTlsOptions =
    raw.KAFKA_SSL_CA_PATH !== undefined ||
    raw.KAFKA_SSL_REJECT_UNAUTHORIZED !== undefined;
  if (!hasTlsOptions || kafkaSslEnabled(raw)) {
    return;
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message:
      'KAFKA_SSL_CA_PATH / KAFKA_SSL_REJECT_UNAUTHORIZED require TLS; set KAFKA_SSL=true',
  });
}

/** The reaper's deadman closes sessions; below the idle window it closes live ones. */
function checkReaperDeadmanOutlivesSession(
  raw: RawEnv,
  ctx: z.RefinementCtx
): void {
  const deadman = raw.SESSION_REAPER_WALLCLOCK_DEADMAN_MS;
  const timeout = raw.SESSION_TIMEOUT_MS;
  if (deadman === undefined || timeout === undefined || deadman >= timeout) {
    return;
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: `SESSION_REAPER_WALLCLOCK_DEADMAN_MS (${deadman}) is below SESSION_TIMEOUT_MS (${timeout}) — the reaper would close sessions that are still live.`,
  });
}

/** The vacuum is a backstop; it must never race normal reaping. */
function checkVacuumOutlivesReaper(raw: RawEnv, ctx: z.RefinementCtx): void {
  const stale = raw.SESSION_VACUUM_STALE_THRESHOLD_MS;
  const deadman =
    raw.SESSION_REAPER_WALLCLOCK_DEADMAN_MS ?? raw.SESSION_TIMEOUT_MS;
  if (stale === undefined || deadman === undefined || stale > deadman) {
    return;
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: `SESSION_VACUUM_STALE_THRESHOLD_MS (${stale}) must exceed the reaper deadman (${deadman}) — the vacuum would drop sessions the reaper is still closing.`,
  });
}

/** A project allowlist for a switch that is off silently does nothing. */
function checkProfileBackfillProjectsHaveAFlag(
  raw: RawEnv,
  ctx: z.RefinementCtx
): void {
  if (
    raw.EXPERIMENTAL_PROFILE_BACKFILL ||
    raw.EXPERIMENTAL_PROFILE_BACKFILL_PROJECTS.length === 0
  ) {
    return;
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message:
      'EXPERIMENTAL_PROFILE_BACKFILL_PROJECTS is set while EXPERIMENTAL_PROFILE_BACKFILL is not 1 — the allowlist has no effect.',
  });
}

// --- derivations ------------------------------------------------------------

function deriveDashboardUrl(raw: RawEnv): string {
  return raw.DASHBOARD_URL ?? '';
}

/** The Kafka transport's knobs, including the producer's three throughput ones. */
function deriveKafkaConfig(raw: RawEnv): CoreConfig['kafka'] {
  return {
    clientId: raw.KAFKA_CLIENT_ID,
    brokers: raw.KAFKA_BROKERS,
    eventsTopic: raw.KAFKA_EVENTS_TOPIC,
    // Same broker as the events topic, so a poison message is retained and
    // countable instead of dropped (ADR-004 delivery semantics).
    eventsDlqTopic:
      raw.KAFKA_EVENTS_DLQ_TOPIC ?? `${raw.KAFKA_EVENTS_TOPIC}-dlq`,
    consumerGroup: raw.KAFKA_CONSUMER_GROUP,
    partitionsConcurrent: raw.KAFKA_PARTITIONS_CONCURRENT,
    minMessages: raw.KAFKA_MIN_MESSAGES,
    maxWaitMs: raw.KAFKA_MAX_WAIT_MS,
    maxMessagesPerPartition: raw.KAFKA_MAX_MESSAGES_PER_PARTITION,
    sessionTimeoutMs: raw.KAFKA_SESSION_TIMEOUT_MS,
    heartbeatIntervalMs: raw.KAFKA_HEARTBEAT_INTERVAL_MS,
    requestTimeoutMs: raw.KAFKA_REQUEST_TIMEOUT_MS,
    connectionTimeoutMs: raw.KAFKA_CONNECTION_TIMEOUT_MS,
    producerRetries: raw.KAFKA_PRODUCER_RETRIES,
    producerInitialRetryMs: raw.KAFKA_PRODUCER_INITIAL_RETRY_MS,
    producerMaxRetryMs: raw.KAFKA_PRODUCER_MAX_RETRY_MS,
    producerMaxInFlight: raw.KAFKA_PRODUCER_MAX_IN_FLIGHT,
    producerBatchSize: raw.KAFKA_PRODUCER_BATCH_SIZE,
    producerBatchLingerMs: raw.KAFKA_PRODUCER_BATCH_LINGER_MS,
    handlerMaxAttempts: raw.KAFKA_HANDLER_MAX_ATTEMPTS,
    handlerRetryInitialMs: raw.KAFKA_HANDLER_RETRY_INITIAL_MS,
    handlerRetryMaxMs: raw.KAFKA_HANDLER_RETRY_MAX_MS,
    security: deriveKafkaSecurity(raw),
  };
}

function deriveKafkaSecurity(raw: RawEnv): CoreConfig['kafka']['security'] {
  const hasCredentials =
    raw.KAFKA_SASL_USERNAME !== undefined &&
    raw.KAFKA_SASL_PASSWORD !== undefined;
  return {
    ssl: {
      enabled: kafkaSslEnabled(raw),
      caPath: raw.KAFKA_SSL_CA_PATH,
      rejectUnauthorized: raw.KAFKA_SSL_REJECT_UNAUTHORIZED,
    },
    sasl: hasCredentials
      ? {
          mechanism: raw.KAFKA_SASL_MECHANISM ?? DEFAULT_KAFKA_SASL_MECHANISM,
          username: raw.KAFKA_SASL_USERNAME as string,
          password: raw.KAFKA_SASL_PASSWORD as string,
        }
      : undefined,
  };
}

function deriveCoreConfig(raw: RawEnv): CoreConfig {
  const isProduction = raw.NODE_ENV === PRODUCTION;
  const exporter =
    raw.LOG_EXPORTER ?? (raw.HYPERDX_API_KEY ? 'otlp' : 'stdout');
  const googleClient = {
    clientId: raw.GOOGLE_CLIENT_ID,
    clientSecret: raw.GOOGLE_CLIENT_SECRET,
  };
  return {
    isProduction,
    isDevelopment: raw.NODE_ENV === DEVELOPMENT,
    selfHosted: raw.SELF_HOSTED,
    dashboardUrl: deriveDashboardUrl(raw),
    demoUserId: raw.DEMO_USER_ID,
    // Clustered mode = production (not self-hosted), unless said otherwise.
    clickhouseClustered: raw.CLICKHOUSE_CLUSTER || !raw.SELF_HOSTED,
    encryptionKey: raw.ENCRYPTION_KEY,
    pingDisabled: raw.DISABLE_PING,
    logging: {
      level: raw.LOG_LEVEL,
      silent: raw.LOG_SILENT,
      exporter,
      hyperdxApiKey: raw.HYPERDX_API_KEY,
      serviceNamePrefix: raw.LOG_PREFIX,
      serviceNameEnvironment: raw.NODE_ENV ?? DEFAULT_SERVICE_ENVIRONMENT,
      interceptProcessOutput:
        isProduction ||
        raw.HYPERDX_API_KEY !== undefined ||
        raw.LOG_EXPORTER !== undefined,
    },
    auth: {
      allowRegistration:
        raw.ALLOW_REGISTRATION === undefined
          ? undefined
          : raw.ALLOW_REGISTRATION !== FALSE_STRING,
      allowInvitation:
        raw.ALLOW_INVITATION === undefined
          ? undefined
          : raw.ALLOW_INVITATION !== FALSE_STRING,
      github: {
        clientId: raw.GITHUB_CLIENT_ID,
        clientSecret: raw.GITHUB_CLIENT_SECRET,
        redirectUri: raw.GITHUB_REDIRECT_URI,
      },
      google: { ...googleClient, redirectUri: raw.GOOGLE_REDIRECT_URI },
      googleGsc: { ...googleClient, redirectUri: raw.GSC_GOOGLE_REDIRECT_URI },
    },
    cookies: {
      extraMultiPartTlds: raw.COOKIE_TLDS.map((tld) => tld.toLowerCase()),
      customDomain: raw.CUSTOM_COOKIE_DOMAIN,
    },
    ai: {
      openai: {
        apiKey: raw.OPENAI_API_KEY,
        baseUrl: raw.OPENAI_BASE_URL,
        project: raw.OPENAI_PROJECT,
        organization: raw.OPENAI_ORGANIZATION,
      },
      anthropic: {
        apiKey: raw.ANTHROPIC_API_KEY,
        baseUrl: raw.ANTHROPIC_BASE_URL,
        authToken: raw.ANTHROPIC_TOKEN,
        version: raw.ANTHROPIC_VERSION,
      },
    },
    slack: {
      clientId: raw.SLACK_CLIENT_ID,
      clientSecret: raw.SLACK_CLIENT_SECRET,
      oauthRedirectUrl: raw.SLACK_OAUTH_REDIRECT_URL,
      stateSecret: raw.SLACK_STATE_SECRET,
    },
    polar: {
      saveDiscountId: raw.POLAR_SAVE_DISCOUNT_ID,
      webhookSecret: raw.POLAR_WEBHOOK_SECRET,
    },
    kafka: deriveKafkaConfig(raw),
    buffers: {
      asyncInserts: raw.BUFFER_ASYNC_INSERTS,
      chInsertConcurrency: raw.BUFFER_CH_INSERT_CONCURRENCY,
      bot: { batchSize: raw.BOT_BUFFER_BATCH_SIZE },
      event: {
        batchSize: raw.EVENT_BUFFER_BATCH_SIZE,
        chunkSize: raw.EVENT_BUFFER_CHUNK_SIZE,
        microBatchMs: raw.EVENT_BUFFER_MICRO_BATCH_MS,
        microBatchSize: raw.EVENT_BUFFER_MICRO_BATCH_SIZE,
      },
      group: {
        batchSize: raw.GROUP_BUFFER_BATCH_SIZE,
        chunkSize: raw.GROUP_BUFFER_CHUNK_SIZE,
        ttlSeconds: raw.GROUP_BUFFER_TTL_IN_SECONDS,
      },
      profile: {
        batchSize: raw.PROFILE_BUFFER_BATCH_SIZE,
        chunkSize: raw.PROFILE_BUFFER_CHUNK_SIZE,
        ttlSeconds: raw.PROFILE_BUFFER_TTL_IN_SECONDS,
        fetchChunkSize: raw.PROFILE_BUFFER_FETCH_CHUNK_SIZE,
      },
      profileBackfill: { batchSize: raw.PROFILE_BACKFILL_BUFFER_BATCH_SIZE },
      replay: {
        batchSize: raw.REPLAY_BUFFER_BATCH_SIZE,
        chunkSize: raw.REPLAY_BUFFER_CHUNK_SIZE,
      },
      session: {
        batchSize: raw.SESSION_BUFFER_BATCH_SIZE,
        chunkSize: raw.SESSION_BUFFER_CHUNK_SIZE,
        squash: raw.SESSION_BUFFER_SQUASH,
      },
    },
    session: {
      timeoutMs: raw.SESSION_TIMEOUT_MS,
      reaperEnabled: raw.SESSION_REAPER,
      reaperBatchSize: raw.SESSION_REAPER_BATCH_SIZE,
      reaperWallclockDeadmanMs: raw.SESSION_REAPER_WALLCLOCK_DEADMAN_MS,
      vacuumEnabled: raw.SESSION_VACUUM,
      vacuumBatchSize: raw.SESSION_VACUUM_BATCH_SIZE,
      vacuumStaleThresholdMs: raw.SESSION_VACUUM_STALE_THRESHOLD_MS,
      profileBackfillEnabled: raw.EXPERIMENTAL_PROFILE_BACKFILL,
      profileBackfillProjectIds: raw.EXPERIMENTAL_PROFILE_BACKFILL_PROJECTS,
    },
    query: {
      eventPropertyValueAutocompleteLimit:
        raw.EVENT_PROPERTY_VALUE_AUTOCOMPLETE_LIMIT,
      cohortMaterializeLimit: raw.COHORT_MATERIALIZE_LIMIT,
      cohortQueryMemoryLimitBytes: raw.COHORT_QUERY_MEMORY_LIMIT_BYTES,
      cohortQuerySpillBytes: raw.COHORT_QUERY_SPILL_BYTES,
      eventListMaxLookbackDays: raw.EVENT_LIST_MAX_LOOKBACK_DAYS,
      sessionListMaxLookbackDays: raw.SESSION_LIST_MAX_LOOKBACK_DAYS,
      importBatchSize: raw.IMPORT_BATCH_SIZE,
      insightsRetentionDays: raw.INSIGHTS_RETENTION_DAYS,
      windDownMaxPerRun: raw.WIND_DOWN_MAX_PER_RUN,
      funnelNonStrictOrdering: raw.FUNNEL_NON_STRICT_ORDERING,
    },
    objectStoreExport: {
      lagSeconds: raw.EXPORT_LAG_SECONDS,
      batchSize: raw.EXPORT_BATCH_SIZE,
      maxBatchesPerRun: raw.EXPORT_MAX_BATCHES_PER_RUN,
      concurrency: raw.EXPORT_CONCURRENCY,
      gcsApiEndpoint: raw.GCS_API_ENDPOINT,
    },
    ipHeaders: {
      attributionOrder: raw.IP_HEADER_ORDER,
      trustedOrder: raw.TRUSTED_IP_HEADER_ORDER,
    },
  };
}

/** What `apps/api` itself branches on, plus `core` for everything below it. */
export interface Config {
  ROLE: Role;
  LOG_LEVEL: string;
  API_PORT: number;
  QUEUE_CLUSTER: boolean;
  QUEUE_NAMESPACE: string | undefined;
  ENABLED_QUEUES: EnabledQueue[];
  DISABLE_WORKERS: boolean;
  DISABLE_BULLBOARD: boolean;
  COOKIE_SECRET: string;
  SHUTDOWN_FORCE_EXIT_MS: number;
  /**
   * The dead-letter list's cap (M20-001). It sits here rather than in
   * `core.kafka` because the destination is no longer Kafka: `apps/api`
   * chooses the dead-letter sink, and `packages/core` only knows the
   * `sendToDeadLetter` seam it is handed.
   */
  INGEST_DEAD_LETTER_MAX_ENTRIES: number;
  /**
   * How long the ingest consumer's duplicate marker key lives. Same reason it
   * is not on `core.kafka`: the marker is keyed on the EVENT, not on a Kafka
   * coordinate, and `packages/core` only knows the `markDuplicateEvent` seam
   * it is handed.
   */
  INGEST_DUPLICATE_MARKER_TTL_MS: number;
  /** The CORS delegator's origin allowlist, in V1's own order. */
  dashboardOrigins: string[];
  /** V1's `ENABLE_VERBOSE_LOGGING`, already split. */
  verboseClientIds: string[];
  /**
   * `Bun.serve`'s listen options. No `hostname` unless API_HOST says one:
   * Bun's default is `0.0.0.0`, and its `localhost` binds IPv6-only.
   */
  listen: { port: number; hostname?: string };
  /** `<QUEUE>_CONCURRENCY`, resolved per registry queue name. */
  concurrency: Record<string, number | undefined>;
  /** Everything `packages/core` reads, parsed and derived once. */
  core: CoreConfig;
}

const envSchema = rawSchema
  // Every cross-field invariant runs BEFORE the transform (ADR-022 R17), so
  // the derivations below can assume a coherent environment.
  .superRefine((raw, ctx) => {
    checkRoleConsumesSomething(raw, ctx);
    checkOtlpHasKey(raw, ctx);
    checkKafkaHeartbeatFitsSession(raw, ctx);
    checkKafkaSaslIsComplete(raw, ctx);
    checkKafkaTlsOptionsHaveTls(raw, ctx);
    checkReaperDeadmanOutlivesSession(raw, ctx);
    checkVacuumOutlivesReaper(raw, ctx);
    checkProfileBackfillProjectsHaveAFlag(raw, ctx);
  })
  .transform((raw): Config => {
    const dashboardUrl = deriveDashboardUrl(raw);
    return {
      ROLE: raw.ROLE,
      LOG_LEVEL: raw.LOG_LEVEL,
      API_PORT: raw.API_PORT,
      QUEUE_CLUSTER: raw.QUEUE_CLUSTER,
      QUEUE_NAMESPACE: raw.QUEUE_NAMESPACE,
      ENABLED_QUEUES: raw.ENABLED_QUEUES,
      DISABLE_WORKERS: raw.DISABLE_WORKERS,
      DISABLE_BULLBOARD: raw.DISABLE_BULLBOARD,
      COOKIE_SECRET: raw.COOKIE_SECRET,
      SHUTDOWN_FORCE_EXIT_MS: raw.SHUTDOWN_FORCE_EXIT_MS,
      INGEST_DEAD_LETTER_MAX_ENTRIES: raw.INGEST_DEAD_LETTER_MAX_ENTRIES,
      INGEST_DUPLICATE_MARKER_TTL_MS: raw.INGEST_DUPLICATE_MARKER_TTL_MS,
      dashboardOrigins: [
        dashboardUrl,
        ...splitTokens(raw.API_CORS_ORIGINS),
      ].filter(Boolean),
      verboseClientIds: splitTokens(raw.ENABLE_VERBOSE_LOGGING),
      listen: raw.API_HOST
        ? { port: raw.API_PORT, hostname: raw.API_HOST }
        : { port: raw.API_PORT },
      concurrency: Object.fromEntries(
        Object.keys(queues).map((name) => [
          name,
          (raw as Record<string, unknown>)[concurrencyEnvKey(name)] as
            | number
            | undefined,
        ])
      ),
      core: deriveCoreConfig(raw),
    };
  });

/** The `<QUEUE>_CONCURRENCY` override for one registry queue, if any. */
export function concurrencyOverride(
  config: Config,
  queueName: string
): number | undefined {
  return config.concurrency[queueName];
}

function formatIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

/**
 * Validates every V2-path env var in one pass. Throws with every issue
 * listed — never just the first one — so a broken boot names its whole
 * problem in one error.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${formatIssues(result.error.issues)}`
    );
  }
  return result.data;
}
