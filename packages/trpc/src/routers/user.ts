import { clerkClient } from '@clerk/fastify';
import { z } from 'zod';

import { transformUser } from '@openpanel/db';

import { createTRPCRouter, protectedProcedure } from '../trpc';

export const userRouter = createTRPCRouter({
  update: protectedProcedure
    .input(
      z.object({
        firstName: z.string(),
        lastName: z.string(),
      })
    )
    .mutation(({ input, ctx }) => {
      return clerkClient.users
        .updateUser(ctx.session.userId, {
          firstName: input.firstName,
          lastName: input.lastName,
        })
        .then(transformUser);
    }),
});
