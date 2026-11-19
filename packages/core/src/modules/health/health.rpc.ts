// The one procedure `rpc.router.ts` mounts before the first real module
// lands — proves the tRPC surface composes end to end. Public, as a liveness
// probe has to be.
//
// No frontend caller exists; kept because `rpc.router.test.ts` pins this procedure.
import { createTRPCRouter, publicProcedure } from '../../rpc/base';

export const healthRouter = createTRPCRouter({
  live: publicProcedure.query(() => ({ live: true as const })),
});
