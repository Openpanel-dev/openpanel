// Account deletion, profile updates and the deletion-blockers check.
//
// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE the
// input parser. The explicit checks in the handlers below stay: `enforceAccess`
// only sees a TOP-LEVEL `projectId` / `organizationId`, so anything resolved
// from another id needs its own.
//
// `ctx.services.user` carries this module's factory; it has no queue/cron of
// its own, same as `conversation`.

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { MAX_NAME } from '../../shared/limits.constants';

export const userRouter = createTRPCRouter({
  deletionBlockers: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.userId;
    return ctx.services.user.listUserDeletionBlockers(userId);
  }),

  delete: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.userId;
    await ctx.services.user.deleteUserAccount(userId);
    ctx.services.auth.deleteSessionTokenCookie(ctx.setCookie);
    return true;
  }),

  update: protectedProcedure
    .input(
      z.object({
        firstName: z.string().trim().min(1).max(MAX_NAME),
        lastName: z.string().trim().min(1).max(MAX_NAME),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      return ctx.services.user.updateUserProfile({ userId, ...input });
    }),
});
