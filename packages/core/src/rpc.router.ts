// The one static composition point for every tRPC procedure this package
// serves. No `defineModule()`, no filesystem discovery — adding a module's
// RPC half is one line here, which is what keeps `AppRouter` a real type
// (ADR-007 decision 19). Only `health` exists so far; the 28 real routers
// land with their module waves (P5-P8).

import { cohortRouter } from './modules/cohort/cohort.rpc';
import { gscRouter } from './modules/gsc/gsc.rpc';
import { healthRouter } from './modules/health/health.rpc';
import { insightRouter } from './modules/insight/insight.rpc';
import { createTRPCRouter } from './rpc/base';

export const appRouter = createTRPCRouter({
  health: healthRouter,
  insight: insightRouter,
  gsc: gscRouter,
  cohort: cohortRouter,
});

export type AppRouter = typeof appRouter;
