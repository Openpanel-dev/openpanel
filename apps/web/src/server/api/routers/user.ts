import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { transformUser } from '@/server/services/user.service';
import { clerkClient } from '@clerk/nextjs';
import { z } from 'zod';

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
