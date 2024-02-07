import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { db } from '@/server/db';
import { hashPassword, verifyPassword } from '@/server/services/hash.service';
import { transformUser } from '@/server/services/user.service';
import { clerkClient } from '@clerk/nextjs';
import { z } from 'zod';

export const userRouter = createTRPCRouter({
  current: protectedProcedure.query(({ ctx }) => {
    return db.user.findUniqueOrThrow({
      where: {
        id: ctx.session.user.id,
      },
    });
  }),
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
