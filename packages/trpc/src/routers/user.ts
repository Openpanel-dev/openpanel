import { z } from 'zod';

import { db } from '@openpanel/db';

import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';

export const userRouter = createTRPCRouter({
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
