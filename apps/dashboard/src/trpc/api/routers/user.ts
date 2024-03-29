import { createTRPCRouter, protectedProcedure } from '@/trpc/api/trpc';
import { clerkClient } from '@clerk/nextjs';
import { z } from 'zod';

import { transformUser } from '@openpanel/db';

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
