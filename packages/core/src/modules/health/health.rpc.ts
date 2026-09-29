// The one procedure `rpc.router.ts` mounts before the first real module
// lands — proves the tRPC surface composes end to end. Public, as a liveness
// probe has to be.
//
// No frontend caller exists for this procedure, and by the letter of the
// module rule a health module would be routes-only. Left in place because
// `rpc.router.test.ts` pins this exact procedure ("the composed appRouter
// serves the health procedure", asserting a 200 from `/trpc/health.live`),
// which is outside this module's scope to edit.
import { createTRPCRouter, publicProcedure } from '../../rpc/base';

export const healthRouter = createTRPCRouter({
  live: publicProcedure.query(() => ({ live: true as const })),
});
