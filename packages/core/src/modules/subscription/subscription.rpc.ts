// Ported from packages/trpc/src/routers/subscription.ts.
//
// Every procedure is on its V1 twin's builder. `protectedProcedure` runs
// `enforceUserIsAuthed` + `enforceAccess` BEFORE the input parser, exactly as
// V1 does. The explicit checks in the handlers below stay: `enforceAccess` only
// sees a TOP-LEVEL `projectId` / `organizationId`, so anything resolved from
// another id needs its own.
//
// `requireOrganizationAdmin` lives in subscription.service.ts, not here — see
// that file's header. `ctx.services.subscription` carries this module's factory
// the same as every other module now.

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import {
  zCancelSubscription,
  zCheckout,
  zPauseSubscription,
} from './subscription.constants';

export const subscriptionRouter = createTRPCRouter({
  getCurrent: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(({ input, ctx }) =>
      ctx.services.subscription.getCurrentSubscriptionProduct(
        input.organizationId
      )
    ),

  checkout: protectedProcedure
    .input(zCheckout)
    .mutation(({ input, ctx }) =>
      ctx.services.subscription.checkout(
        ctx.session.userId,
        input,
        ctx.remoteAddress
      )
    ),

  products: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(({ input, ctx }) =>
      ctx.services.subscription.listProducts(input.organizationId)
    ),

  usage: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(({ input, ctx }) =>
      ctx.services.subscription.getUsage(input.organizationId)
    ),

  cancelSubscription: protectedProcedure
    .input(zCancelSubscription)
    .mutation(({ input, ctx }) =>
      ctx.services.subscription.cancelSubscription(ctx.session.userId, input)
    ),

  pauseSubscription: protectedProcedure
    .input(zPauseSubscription)
    .mutation(({ input, ctx }) =>
      ctx.services.subscription.pauseSubscription(ctx.session.userId, input)
    ),

  resumeSubscription: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(({ input, ctx }) =>
      ctx.services.subscription.resumeSubscription(
        ctx.session.userId,
        input.organizationId
      )
    ),

  applySaveDiscount: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(({ input, ctx }) =>
      ctx.services.subscription.applySaveDiscount(
        ctx.session.userId,
        input.organizationId
      )
    ),

  portal: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(({ input, ctx }) =>
      ctx.services.subscription.portal(ctx.session.userId, input.organizationId)
    ),
});
