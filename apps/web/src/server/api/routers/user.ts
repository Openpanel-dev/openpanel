import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { db } from '@/server/db';
import { hashPassword, verifyPassword } from '@/server/services/hash.service';
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
        name: z.string(),
        email: z.string(),
      })
    )
    .mutation(({ input, ctx }) => {
      return db.user.update({
        where: {
          id: ctx.session.user.id,
        },
        data: {
          name: input.name,
          email: input.email,
        },
      });
    }),
  changePassword: protectedProcedure
    .input(
      z.object({
        password: z.string(),
        oldPassword: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await db.user.findUniqueOrThrow({
        where: {
          id: ctx.session.user.id,
        },
      });

      if (!(await verifyPassword(input.oldPassword, user.password))) {
        throw new Error('Old password is incorrect');
      }

      return db.user.update({
        where: {
          id: ctx.session.user.id,
        },
        data: {
          password: await hashPassword(input.password),
        },
      });
    }),
  invite: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        organizationId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await db.invite.create({
        data: {
          organization_id: input.organizationId,
          email: input.email,
        },
      });
    }),
});
