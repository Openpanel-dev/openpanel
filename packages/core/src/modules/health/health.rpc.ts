// The one procedure `rpc.router.ts` mounts before the first real module lands
// (ADR-007 decision 19) — proves the tRPC surface composes end to end. No V1
// router named `health` exists; the 28 real ones arrive with their module
// waves (P5-P8).

import { createTRPCRouter, procedure } from '../../rpc/base';

export const healthRouter = createTRPCRouter({
  live: procedure.query(() => ({ live: true as const })),
});
