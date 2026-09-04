// Ported from packages/trpc/src/routers/subscription.ts (M6-006).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" check inline,
// exactly like V1's `enforceUserIsAuthed`. V1 keeps serving the live route
// through packages/trpc's own `protectedProcedure` (full stack included) and
// delegates its handler bodies to core's subscription functions (DELEGATE
// PATTERN), so nothing here is a live regression.
//
// `requireOrganizationAdmin` lives in subscription.service.ts, not here —
// see that file's header.

import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
import { TRPCAccessError } from '../../rpc/errors';
import {
  zCancelSubscription,
  zCheckout,
  zPauseSubscription,
} from './subscription.constants';
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
} from './subscription.service';

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const subscriptionRouter = createTRPCRouter({
  getCurrent: procedure
    .input(z.object({ organizationId: z.string() }))
    .query(({ input }) => getCurrentSubscriptionProduct(input.organizationId)),

  checkout: procedure
    .input(zCheckout)
    .mutation(({ input, ctx }) =>
      checkout(requireLogin(ctx.session.userId), input, ctx.remoteAddress)
    ),

  products: procedure
    .input(z.object({ organizationId: z.string() }))
    .query(({ input }) => listProducts(input.organizationId)),

  usage: procedure
    .input(z.object({ organizationId: z.string() }))
    .query(({ input }) => getUsage(input.organizationId)),

  cancelSubscription: procedure
    .input(zCancelSubscription)
    .mutation(({ input, ctx }) =>
      cancelSubscription(requireLogin(ctx.session.userId), input)
    ),

  pauseSubscription: procedure
    .input(zPauseSubscription)
    .mutation(({ input, ctx }) =>
      pauseSubscription(requireLogin(ctx.session.userId), input)
    ),

  resumeSubscription: procedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(({ input, ctx }) =>
      resumeSubscription(requireLogin(ctx.session.userId), input.organizationId)
    ),

  applySaveDiscount: procedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(({ input, ctx }) =>
      applySaveDiscount(requireLogin(ctx.session.userId), input.organizationId)
    ),

  portal: procedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(({ input, ctx }) =>
      portal(requireLogin(ctx.session.userId), input.organizationId)
    ),
});
