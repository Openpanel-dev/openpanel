// The sole `process.env` reader on the V2 boot path (main.ts + core wiring),
// per TARGET_ARCHITECTURE §7 "apps/api — three files". `packages/db` and
// `packages/redis` keep reading their own env until they grow factories —
// an accepted pragmatic deviation (ADR-007 §7) — so this catalogue covers
// only what `main.ts` itself reads today: TZ, ROLE, LOG_LEVEL, API_PORT,
// SELF_HOSTED and QUEUE_CLUSTER.
//
// Invalid config fails boot loudly, with every issue reported at once —
// never a fail-fast on the first bad var.

import { z } from 'zod';

export const ROLE_VALUES = ['api', 'worker', 'all'] as const;
export type Role = (typeof ROLE_VALUES)[number];

const DEFAULT_API_PORT = 3000;
const DEFAULT_LOG_LEVEL = 'info';
const TRUE_STRING = 'true';

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

const envSchema = z.object({
  ROLE: roleSchema,
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
});

export type Config = z.infer<typeof envSchema>;

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
