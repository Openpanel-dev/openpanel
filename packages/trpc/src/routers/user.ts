import { z } from 'zod';

import { deleteSessionTokenCookie } from '@openpanel/auth';
import { db } from '@openpanel/db';

import { TRPCBadRequestError } from '../errors';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';

export const userRouter = createTRPCRouter({
  // Organizations the user created that still have a blocking subscription
  // (active and not scheduled to cancel). The account cannot be deleted while
  // any of these exist.
  deletionBlockers: protectedProcedure.query(async ({ ctx }) => {
    const organizations = await db.organization.findMany({
      where: { createdByUserId: ctx.session.userId },
    });
    return organizations
      .filter(
        (organization) =>
          organization.hasSubscription && !organization.isWillBeCanceled,
      )
      .map((organization) => ({
        id: organization.id,
        name: organization.name,
      }));
  }),

  delete: protectedProcedure.mutation(async ({ ctx }) => {
    const organizations = await db.organization.findMany({
      where: { createdByUserId: ctx.session.userId },
    });
    const blocking = organizations.filter(
      (organization) =>
        organization.hasSubscription && !organization.isWillBeCanceled,
    );

    if (blocking.length > 0) {
      throw TRPCBadRequestError(
        `Please cancel the subscription for ${blocking
          .map((organization) => organization.name)
          .join(', ')} before deleting your account.`,
      );
    }

    // Hard delete the user. Cascades clean up sessions, accounts, totp,
    // twoFactorChallenges, members, projectAccess, invites and conversations.
    // Organizations the user created have `createdByUserId`/`subscriptionCreatedByUserId`
    // set to null (SetNull); any org left without an org:admin member is then
    // removed by the `delete` cron.
    await db.user.delete({ where: { id: ctx.session.userId } });
    deleteSessionTokenCookie(ctx.setCookie);

    return true;
  }),

  update: protectedProcedure
    .input(
      z.object({
        firstName: z.string(),
        lastName: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return db.user.update({
        where: {
          id: ctx.session.userId,
        },
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
        },
      });
    }),
  debugPostCookie: protectedProcedure
    .input(
      z.object({
        sameSite: z.enum(['lax', 'strict', 'none']),
        domain: z.string(),
      }),
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
      }),
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
