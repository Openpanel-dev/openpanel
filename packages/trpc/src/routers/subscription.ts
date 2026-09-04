// Dissolved into @openpanel/core's subscription module (M6-006): the
// checkout/products/usage/cancel/pause/resume/save-discount/portal bodies
// moved to packages/core/src/modules/subscription/subscription.service.ts.
// This router stays (DELEGATE PATTERN) — it keeps V1's protectedProcedure
// stack (session/access/logger/rate-limit middleware) and delegates every
// handler body to core's subscription functions, same as notification's
// router does (M6-005).

import {
  applySaveDiscount,
  cancelSubscription,
  checkout,
  getCurrentSubscriptionProduct,
  getUsage,
  listProducts,
  pauseSubscription,
  portal,
  resumeSubscription,
} from '@openpanel/core';
import {
  zCancelSubscription,
  zCheckout,
  zPauseSubscription,
} from '@openpanel/validation';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const subscriptionRouter = createTRPCRouter({
  getCurrent: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(({ input }) => getCurrentSubscriptionProduct(input.organizationId)),

  checkout: protectedProcedure
    .input(zCheckout)
    .mutation(({ input, ctx }) =>
      checkout(ctx.session.userId, input, ctx.remoteAddress)
    ),

  products: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(({ input }) => listProducts(input.organizationId)),

  usage: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(({ input }) => getUsage(input.organizationId)),

  cancelSubscription: protectedProcedure
    .input(zCancelSubscription)
    .mutation(({ input, ctx }) =>
      cancelSubscription(ctx.session.userId, input)
    ),

  pauseSubscription: protectedProcedure
    .input(zPauseSubscription)
    .mutation(({ input, ctx }) => pauseSubscription(ctx.session.userId, input)),

  resumeSubscription: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(({ input, ctx }) =>
      resumeSubscription(ctx.session.userId, input.organizationId)
    ),

  applySaveDiscount: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(({ input, ctx }) =>
      applySaveDiscount(ctx.session.userId, input.organizationId)
    ),

  portal: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(({ input, ctx }) =>
      portal(ctx.session.userId, input.organizationId)
    ),
});
