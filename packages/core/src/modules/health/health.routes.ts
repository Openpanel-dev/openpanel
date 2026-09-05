// Kubernetes liveness and readiness. Ported from V1's
// controllers/healthcheck.controller.ts `liveness`/`readiness` and
// apps/worker/src/index.ts's two probes, which agreed on both bodies.
//
// `/healthcheck` — the deep db/ch/redis probe — still waits for real clients
// on `AppDeps` (P3+); porting it against `unknown` deps would be a fake check,
// not a deferred one. `/healthz/ready` does NOT wait for them: its two inputs
// are the shutdown flag and the events-consumer heartbeat, both of which are
// real from P9 (M9-002), and a readiness probe that ignores a draining process
// is the one that actually loses requests.

import { z } from 'zod';
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
);
