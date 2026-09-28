// The one procedure `rpc.router.ts` mounts before the first real module lands
// (ADR-007 decision 19) — proves the tRPC surface composes end to end. No V1
// router named `health` exists; the 28 real ones arrived with their module
// waves (P5-P8). Public, as a liveness probe has to be.
//
// R2: no frontend caller exists for this procedure, and by the letter of the
// rule a health module is routes-only. Left in place — see the M15-111 report —
// because `../../rpc.router.test.ts:16-34` pins this exact procedure ("the
// composed appRouter serves the health procedure", asserting a 200 from
// `/trpc/health.live`), and that file is outside this module's scope to edit.
import { createTRPCRouter, publicProcedure } from '../../rpc/base';

export const healthRouter = createTRPCRouter({
  live: publicProcedure.query(() => ({ live: true as const })),
});
