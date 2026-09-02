// Kubernetes liveness — shallow, event loop only. Ported from V1's
// controllers/healthcheck.controller.ts `liveness`; `/healthcheck` and
// `/healthz/ready`'s dependency/shutdown checks return once db, ch, redis and
// a shutdown flag are real (P3+) — porting them against `unknown` deps now
// would be a fake check, not a deferred one.

import { defineRoutes } from '../../http/define';

export const healthRoutes = defineRoutes((app) =>
  app.get('/healthz/live', () => ({ live: true }))
);
