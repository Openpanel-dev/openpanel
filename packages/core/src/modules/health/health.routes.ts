// Kubernetes liveness and readiness. Ported from V1's
// controllers/healthcheck.controller.ts `liveness`/`readiness` and
// apps/worker/src/index.ts's two probes, which agreed on both bodies.
//
// `/healthcheck` — the deep db/ch/redis probe — landed at M9-004, when
// `AppDeps` started carrying the real clients; before that, porting it would
// have been a fake check rather than a deferred one. `/healthz/ready` never
// waited for them: its two inputs are the shutdown flag and the events-consumer
// heartbeat, both real from P9 (M9-002), and a readiness probe that ignores a
// draining process is the one that actually loses requests.
//
// `GET /` lands here too: V1 served it from the public-API scope
// (apps/api/src/app.ts:400), hidden from the OpenAPI document like the probes,
// and self-hosters use it as a "is this thing on" check.

import { tryCatch } from '@openpanel/shared';
import { z } from 'zod';
import { chQuery } from '../../ch-query';
import { defineRoutes } from '../../http/define';
import { currentReadiness } from './src/readiness';

// The first zod schema through the OpenAPI plugin (ADR-003): response schemas
// generate with `io: 'output'`, which is what zod 4's native Standard Schema
// JSON conversion does by default for the `response` slot — no
// `mapJsonSchema` override needed, and none is added, because that hook gets
// no `io` argument and would collapse the input/output split the ADR requires.
const healthLiveResponseSchema = z.object({ live: z.literal(true) });

// V1's two readiness bodies, verbatim: `{ready:true}` at 200, and
// `{ready:false, reason, idleMs?, thresholdMs?}` at 503.
const healthReadyResponseSchema = z.object({
  ready: z.boolean(),
  reason: z.string().optional(),
  idleMs: z.number().optional(),
  thresholdMs: z.number().optional(),
});

const SERVICE_UNAVAILABLE = 503;
const OK = 200;

/** V1's `GET /` body, byte-for-byte (apps/api/src/app.ts:401-404). */
const ROOT_BODY = {
  status: 'ok',
  message: 'Successfully running OpenPanel.dev API',
} as const;

// Hidden from the OpenAPI document — ported from V1's `schema: { hide: true }`
// on `/healthz/live`, `/healthz/ready` and `/healthcheck`
// (healthcheck.controller.ts): liveness probes are not part of the public API
// contract. See verification/golden/openapi's migrated-route gate, which pins
// `/healthz` to an empty `paths` object against V1's golden document.
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
        // core's own `chQuery` over `ctx.ch` — the same round-robin + retry
        // proxy every real read takes (M10-009; `ctx.ch.query` IS
        // `withRetry(client => client.query(...))`, see ch-query.ts).
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

        const failedDependencies = Object.entries(dependencies)
          .filter(([, ok]) => !ok)
          .map(([name]) => name);
        const workingDependencies = Object.entries(dependencies)
          .filter(([, ok]) => ok)
          .map(([name]) => name);

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
      { detail: { hide: true } }
    )
    .get('/', () => ROOT_BODY, { detail: { hide: true } })
);
