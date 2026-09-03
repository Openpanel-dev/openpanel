// Ported from packages/trpc/src/routers/user.ts (M6-001).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" check inline,
// exactly like V1's `enforceUserIsAuthed`. V1 keeps serving the live route
// through packages/trpc's own `protectedProcedure` (full stack included) and
// delegates its handler bodies to core's user functions (DELEGATE PATTERN) —
// this module has no queue/cron of its own, so there is no
// `ctx.services.user`, same as `conversation`.

import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
import { TRPCAccessError } from '../../rpc/errors';
import { deleteSessionTokenCookie } from '../auth/auth.service';
import {
  deleteUserAccount,
  listUserDeletionBlockers,
  updateUserProfile,
} from './user.service';

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const userRouter = createTRPCRouter({
  deletionBlockers: procedure.query(async ({ ctx }) => {
    const userId = requireLogin(ctx.session.userId);
    return listUserDeletionBlockers(userId);
  }),

  delete: procedure.mutation(async ({ ctx }) => {
    const userId = requireLogin(ctx.session.userId);
    await deleteUserAccount(userId);
    deleteSessionTokenCookie(ctx.setCookie);
    return true;
  }),

  update: procedure
    .input(
      z.object({
        firstName: z.string(),
        lastName: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      return updateUserProfile({ userId, ...input });
    }),

  debugPostCookie: procedure
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

  debugGetCookie: procedure
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
