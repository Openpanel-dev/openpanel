import { clerkClient } from '@clerk/fastify';
import { z } from 'zod';

import { db } from '@openpanel/db';

import { createTRPCRouter, protectedProcedure } from '../trpc';

export const userRouter = createTRPCRouter({
  update: protectedProcedure
    .input(
      z.object({
        firstName: z.string(),
        lastName: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const [updatedUser] = await Promise.all([
        db.user.update({
          where: {
            id: ctx.session.userId,
          },
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
          },
        }),
        clerkClient.users.updateUser(ctx.session.userId, {
          firstName: input.firstName,
          lastName: input.lastName,
        }),
      ]);

      return updatedUser;
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
