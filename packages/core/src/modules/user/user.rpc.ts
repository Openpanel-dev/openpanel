// Ported from packages/trpc/src/routers/user.ts (M6-001).
//
// M11-001: every procedure is on its V1 twin's builder.
// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE
// the input parser, exactly as V1 does. The explicit checks in the handlers
// below stay: `enforceAccess` only sees a TOP-LEVEL `projectId` /
// `organizationId`, so anything resolved from another id needs its own
// (ADR-011).
//
// `ctx.services.user` carries this module's factory (M10-004); it has no
// queue/cron of its own, same as `conversation`.

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { TRPCAccessError } from '../../rpc/errors';
import { deleteSessionTokenCookie } from '../auth/auth.service';

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const userRouter = createTRPCRouter({
  deletionBlockers: protectedProcedure.query(async ({ ctx }) => {
    const userId = requireLogin(ctx.session.userId);
    return ctx.services.user.listUserDeletionBlockers(userId);
  }),

  delete: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = requireLogin(ctx.session.userId);
    await ctx.services.user.deleteUserAccount(userId);
    deleteSessionTokenCookie(ctx.setCookie);
    return true;
  }),

  update: protectedProcedure
    .input(
      z.object({
        firstName: z.string(),
        lastName: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      return ctx.services.user.updateUserProfile({ userId, ...input });
    }),

  debugPostCookie: protectedProcedure
    .input(
      z.object({
        sameSite: z.enum(['lax', 'strict', 'none']),
        domain: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireLogin(ctx.session.userId);
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
      })
    )
    .query(async ({ ctx, input }) => {
      requireLogin(ctx.session.userId);
      ctx.setCookie('debugCookie', new Date().toISOString(), {
        domain: input.domain,
        sameSite: input.sameSite,
        httpOnly: true,
        secure: true,
        path: '/',
      });
    }),
});
