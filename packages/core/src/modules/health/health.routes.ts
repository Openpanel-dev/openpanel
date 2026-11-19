// Kubernetes liveness and readiness.
//
// `/healthcheck` — the deep db/ch/redis probe — needs `AppDeps` carrying the
// real clients. `/healthz/ready` never waits for them: its two inputs are the
// shutdown flag and the events-consumer heartbeat, and a readiness probe that
// ignores a draining process is the one that actually loses requests.
//
// `GET /` lands here too, hidden from the OpenAPI document like the probes,
// and self-hosters use it as a "is this thing on" check.

import { tryCatch } from '@openpanel/shared';
import { z } from 'zod';
import { chQuery } from '../../ch-query';
import { defineRoutes } from '../../http/define';
import { currentReadiness } from './src/readiness';

// Response schemas generate with `io: 'output'`, which is zod 4's default for the
// `response` slot. No `mapJsonSchema` override: that hook gets no `io` argument and
// would collapse the input/output split this schema relies on.
const healthLiveResponseSchema = z.object({ live: z.literal(true) });

// Two readiness bodies: `{ready:true}` at 200, and
// `{ready:false, reason, idleMs?, thresholdMs?}` at 503.
const healthReadyResponseSchema = z.object({
  ready: z.boolean(),
  reason: z.string().optional(),
  idleMs: z.number().optional(),
  thresholdMs: z.number().optional(),
});

const healthCheckResponseSchema = z.object({
  ready: z.boolean(),
  redis: z.boolean(),
  db: z.boolean(),
  ch: z.boolean(),
  failedDependencies: z.array(z.string()),
  workingDependencies: z.array(z.string()),
});

const SERVICE_UNAVAILABLE = 503;
const OK = 200;

const ROOT_BODY = {
  status: 'ok',
  message: 'Successfully running OpenPanel.dev API',
} as const;

const rootResponseSchema = z.object({
  status: z.literal(ROOT_BODY.status),
  message: z.literal(ROOT_BODY.message),
});

// Hidden from the OpenAPI document: liveness probes are not part of the
// public API contract.
export const healthRoutes = defineRoutes((app) =>
  app
    .get('/healthz/live', () => ({ live: true as const }), {
      response: healthLiveResponseSchema,
      detail: { hide: true },
    })
    .get(
      '/healthz/ready',
      ({ set }) => {
        const readiness = currentReadiness();
        if (!readiness.ready) {
          set.status = SERVICE_UNAVAILABLE;
        }
        return readiness;
      },
      {
        response: healthReadyResponseSchema,
        detail: { hide: true },
      }
    )
    .get(
      '/healthcheck',
      async ({ ctx, set }) => {
        // Core's own `chQuery` over `ctx.ch` — the same round-robin + retry
        // proxy every real read takes (`ctx.ch.query` IS `withRetry(client =>
        // client.query(...))`, see ch-query.ts).
        const [redisResult, dbResult, chResult] = await Promise.all([
          tryCatch(async () => (await ctx.redis.ping()) === 'PONG'),
          tryCatch(async () => Boolean(await ctx.db.$executeRaw`SELECT 1`)),
          tryCatch(async () => (await chQuery(ctx, 'SELECT 1')).length > 0),
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

        const failedDependencies: string[] = [];
        const workingDependencies: string[] = [];
        for (const [name, ok] of Object.entries(dependencies)) {
          (ok ? workingDependencies : failedDependencies).push(name);
        }

        const status =
          failedDependencies.length === 0 ? OK : SERVICE_UNAVAILABLE;

        if (status === OK) {
          ctx.logger.debug(
            { workingDependencies, failedDependencies, dependencies },
            'healthcheck passed'
          );
        } else {
          ctx.logger.warn(
            {
              workingDependencies,
              failedDependencies,
              dependencies,
              dependencyErrors,
            },
            'healthcheck failed'
          );
        }

        set.status = status;
        return {
          ready: status === OK,
          ...dependencies,
          failedDependencies,
          workingDependencies,
        };
      },
      {
        response: healthCheckResponseSchema,
        detail: { hide: true },
      }
    )
    .get('/', () => ROOT_BODY, {
      response: rootResponseSchema,
      detail: { hide: true },
    })
);
