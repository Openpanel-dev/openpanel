// The one procedure `rpc.router.ts` mounts before the first real module lands
// (ADR-007 decision 19) — proves the tRPC surface composes end to end. No V1
// router named `health` exists; the 28 real ones arrived with their module
// waves (P5-P8). Public, as a liveness probe has to be.

import { createTRPCRouter, publicProcedure } from '../../rpc/base';

export const healthRouter = createTRPCRouter({
  live: publicProcedure.query(() => ({ live: true as const })),
});
