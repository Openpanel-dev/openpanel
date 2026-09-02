// Kubernetes liveness — shallow, event loop only. Ported from V1's
// controllers/healthcheck.controller.ts `liveness`; `/healthcheck` and
// `/healthz/ready`'s dependency/shutdown checks return once db, ch, redis and
// a shutdown flag are real (P3+) — porting them against `unknown` deps now
// would be a fake check, not a deferred one.

import { z } from 'zod';
import { defineRoutes } from '../../http/define';

// The first zod schema through the OpenAPI plugin (ADR-003): response schemas
// generate with `io: 'output'`, which is what zod 4's native Standard Schema
// JSON conversion does by default for the `response` slot — no
// `mapJsonSchema` override needed, and none is added, because that hook gets
// no `io` argument and would collapse the input/output split the ADR requires.
const healthLiveResponseSchema = z.object({ live: z.literal(true) });

export const healthRoutes = defineRoutes((app) =>
  app.get('/healthz/live', () => ({ live: true as const }), {
    response: healthLiveResponseSchema,
  })
);
