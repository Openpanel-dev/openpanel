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
      return (
        clerkClient.users
          .updateUser(ctx.session.userId, {
            firstName: input.firstName,
            lastName: input.lastName,
          })
          // Typescript issue that is fine for now,
          // the properties we need are there
          // Will be resolved when we update clerk/nextjs to v5
          // @ts-expect-error
          .then(transformUser)
      );
    }),
});
