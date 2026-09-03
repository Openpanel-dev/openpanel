// Dissolved into @openpanel/core's user module (M6-001): the CRUD itself
// moved to packages/core/src/modules/user/user.service.ts. This router
// stays (DELEGATE PATTERN) — it keeps V1's protectedProcedure stack
// (session/access/logger/rate-limit middleware) and delegates every handler
// body to core's user functions, same as conversation's router does
// (M5-006).
import {
  deleteSessionTokenCookie,
  deleteUserAccount,
  listUserDeletionBlockers,
  updateUserProfile,
} from '@openpanel/core';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const userRouter = createTRPCRouter({
  // Organizations the user created that still have a blocking subscription
  // (active and not scheduled to cancel). The account cannot be deleted while
  // any of these exist.
  deletionBlockers: protectedProcedure.query(async ({ ctx }) => {
    return listUserDeletionBlockers(ctx.session.userId);
  }),

  delete: protectedProcedure.mutation(async ({ ctx }) => {
    await deleteUserAccount(ctx.session.userId);
    deleteSessionTokenCookie(ctx.setCookie);

    return true;
  }),

  update: protectedProcedure
    .input(
      z.object({
        firstName: z.string(),
        lastName: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return updateUserProfile({ userId: ctx.session.userId, ...input });
    }),
  debugPostCookie: protectedProcedure
    .input(
      z.object({
        sameSite: z.enum(['lax', 'strict', 'none']),
        domain: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      ctx.setCookie('debugCookie', new Date().toISOString(), {
        domain: input.domain,
        sameSite: input.sameSite,
        httpOnly: true,
        secure: true,
        path: '/',
      });
    }),
  debugGetCookie: protectedProcedure
    .input(
      z.object({
        sameSite: z.enum(['lax', 'strict', 'none']),
        domain: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      ctx.setCookie('debugCookie', new Date().toISOString(), {
        domain: input.domain,
        sameSite: input.sameSite,
        httpOnly: true,
        secure: true,
        path: '/',
      });
    }),
});
