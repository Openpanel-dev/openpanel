// The sole `process.env` reader on the V2 boot path (main.ts + core wiring),
// per TARGET_ARCHITECTURE §7 "apps/api — three files". `packages/db` and
// `packages/redis` keep reading their own env until they grow factories —
// an accepted pragmatic deviation (ADR-007 §7) — so this catalogue covers
// only what `main.ts` itself reads today: TZ, ROLE, NODE_ENV, LOG_LEVEL,
// API_PORT, API_HOST, SELF_HOSTED, QUEUE_CLUSTER, QUEUE_NAMESPACE,
// ENABLED_QUEUES, the seven `<QUEUE>_CONCURRENCY` overrides, DISABLE_WORKERS,
// DISABLE_BULLBOARD and SHUTDOWN_FORCE_EXIT_MS.
//
// Invalid config fails boot loudly, with every issue reported at once —
// never a fail-fast on the first bad var.

import { queues } from '@openpanel/core';
import { z } from 'zod';

export const ROLE_VALUES = ['api', 'worker', 'all'] as const;
export type Role = (typeof ROLE_VALUES)[number];

const DEFAULT_API_PORT = 3000;
const DEFAULT_LOG_LEVEL = 'info';
const TRUE_STRING = 'true';
const PRODUCTION = 'production';
/** V1's worker deadline (apps/worker/src/boot-workers.ts). */
const DEFAULT_SHUTDOWN_FORCE_EXIT_MS = 20_000;

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

// An unset or blank var should fall through to the default, matching the
// `value?.trim() || fallback` idiom the ported reads used before this file
// existed — `.default()` alone only fires on `undefined`, not `""`.
function blankToUndefined(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

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
    // Refine before transform (TARGET_ARCHITECTURE §7): the cast is only
    // ever observed once the refinement above has already accepted the
    // value.
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

function splitTokens(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return value
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

/** V1 treated any defined value as "off" for workers and only `'1'`/`'true'`
 *  as "off" for bull-board. Both spellings port as-is. */
const definedIsTrueSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .optional()
    .transform((value) => value !== undefined)
);

const oneOrTrueSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .optional()
    .transform((value) => value === '1' || value === TRUE_STRING)
);

/** One `<QUEUE>_CONCURRENCY` slot per registry queue. V1 ignored a
 *  non-numeric or non-positive value and kept the default; so does this. */
const concurrencySchema = z.preprocess(
  blankToUndefined,
  z.coerce.number().int().positive().optional().catch(undefined)
);

const concurrencyShape = Object.fromEntries(
  Object.keys(queues).map((name) => [
    concurrencyEnvKey(name),
    concurrencySchema,
  ])
) as Record<string, typeof concurrencySchema>;

const envSchema = z.object({
  ...concurrencyShape,
  ROLE: roleSchema,
  NODE_ENV: z.preprocess(blankToUndefined, z.string().optional()),
  LOG_LEVEL: z.preprocess(
    blankToUndefined,
    z.string().default(DEFAULT_LOG_LEVEL)
  ),
  API_PORT: z.coerce.number().int().min(0).default(DEFAULT_API_PORT),
  SELF_HOSTED: z
    .string()
    .optional()
    .default('false')
    .transform((value) => value === TRUE_STRING),
  /**
   * Redis Cluster hash-tags every queue key (`cron` -> `{cron}`). Read here
   * because `main.ts` hands it to `createProducers`, and it decides a Redis
   * key name: set it on a deployment whose queues already exist unbraced and
   * every one of them is orphaned. V1 read it as a bare truthy check
   * (`packages/queue/src/queues.ts` `getQueueName`); a blank value is unset,
   * exactly as before.
   */
  QUEUE_CLUSTER: z.preprocess(
    blankToUndefined,
    z
      .string()
      .optional()
      .transform((value) => value !== undefined)
  ),
  /**
   * Isolates two deployments — or a proof run and the dev box — sharing one
   * Redis (`queueKey`'s `namespace`). UNSET in every real deployment: setting
   * it renames every queue key, which orphans the jobs already in Redis.
   */
  QUEUE_NAMESPACE: z.preprocess(blankToUndefined, z.string().optional()),
  ENABLED_QUEUES: enabledQueuesSchema,
  DISABLE_WORKERS: definedIsTrueSchema,
  DISABLE_BULLBOARD: oneOrTrueSchema,
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
  API_HOST: z.preprocess(blankToUndefined, z.string().optional()),
  /**
   * The CORS delegator's allowlist (apps/api/src/app.ts:107-110): the
   * dashboard's own origin plus any extra comma-separated ones. Read once at
   * boot, exactly as V1 did — changing an origin has always needed a restart.
   */
  DASHBOARD_URL: z.preprocess(blankToUndefined, z.string().optional()),
  NEXT_PUBLIC_DASHBOARD_URL: z.preprocess(
    blankToUndefined,
    z.string().optional()
  ),
  API_CORS_ORIGINS: z.preprocess(blankToUndefined, z.string().optional()),
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
  DEMO_USER_ID: z.preprocess(blankToUndefined, z.string().optional()),
  /** V1's `requestLoggingHook`: the client ids whose requests log ip/UA. */
  ENABLE_VERBOSE_LOGGING: z.preprocess(blankToUndefined, z.string().optional()),
  SHUTDOWN_FORCE_EXIT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_SHUTDOWN_FORCE_EXIT_MS),
});

export type Config = z.infer<typeof envSchema> & {
  [key: `${string}_CONCURRENCY`]: number | undefined;
};

/** The CORS delegator's origin allowlist, in V1's own order. */
export function dashboardOrigins(config: Config): string[] {
  return [
    config.DASHBOARD_URL ?? config.NEXT_PUBLIC_DASHBOARD_URL,
    ...splitTokens(config.API_CORS_ORIGINS),
  ].filter((origin): origin is string => Boolean(origin));
}

/** V1's `ENABLE_VERBOSE_LOGGING`, a comma-separated client-id list. */
export function verboseClientIds(config: Config): string[] {
  return splitTokens(config.ENABLE_VERBOSE_LOGGING);
}

/** V1's default host rule (apps/api/src/index.ts). */
export function apiHost(config: Config): string {
  return config.API_HOST ?? (isProduction(config) ? '0.0.0.0' : 'localhost');
}

export function isProduction(config: Config): boolean {
  return config.NODE_ENV === PRODUCTION;
}

/** The `<QUEUE>_CONCURRENCY` override for one registry queue, if any. */
export function concurrencyOverride(
  config: Config,
  queueName: string
): number | undefined {
  return (config as Record<string, unknown>)[concurrencyEnvKey(queueName)] as
    | number
    | undefined;
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
