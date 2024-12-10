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
});
