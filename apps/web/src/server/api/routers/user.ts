import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";
import { db } from "@/server/db";
import { hashPassword } from "@/server/services/hash.service";

export const userRouter = createTRPCRouter({
  current: protectedProcedure.query(({ ctx }) => {
    return db.user.findUniqueOrThrow({
      where: {
        id: ctx.session.user.id
      }
    })
  }),
  update: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        email: z.string(),
      }),
    )
    .mutation(({ input, ctx }) => {
      return db.user.update({
        where: {
          id: ctx.session.user.id
        },
        data: {
          name: input.name,
          email: input.email,
        }
      })
    }),
  changePassword: protectedProcedure
    .input(
      z.object({
        password: z.string(),
        oldPassword: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = await db.user.findUniqueOrThrow({
        where: {
          id: ctx.session.user.id
        }
      })

      if(user.password !== input.oldPassword) {
        throw new Error('Old password is incorrect')
      }

      if(user.password === input.password) {
        throw new Error('New password cannot be the same as old password')
      }

      return db.user.update({
        where: {
          id: ctx.session.user.id
        },
        data: {
          password: await hashPassword(input.password),
        }
      })
    }),
});
