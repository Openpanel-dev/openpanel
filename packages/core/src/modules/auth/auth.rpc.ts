// Ported from packages/trpc/src/routers/auth.ts (M6-003).
//
// M11-001: every procedure is on its V1 twin's builder.
// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE
// the input parser, exactly as V1 does. The explicit checks in the handlers
// below stay: `enforceAccess` only sees a TOP-LEVEL `projectId` /
// `organizationId`, so anything resolved from another id needs its own
// (ADR-011).
//
// The ten V1 `rateLimitMiddleware` wrappers on this router did NOT move with
// M11-001 and are not mounted; `createRateLimitMiddleware` in rpc/base.ts is
// the seam that will carry them.
//
// This module has no queue/cron of its own, so there is no
// `ctx.services.auth` entry here — same shape as `user`/`project`.

import { z } from 'zod';
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '../../rpc/base';
import { TRPCAccessError } from '../../rpc/errors';
import {
  zProvider,
  zRequestResetPassword,
  zResetPassword,
  zSignInEmail,
  zSignInShare,
  zSignUpEmail,
  zTotpCode,
  zTotpOrRecoveryCode,
} from './auth.constants';
import {
  disableTotp,
  enableTotp,
  extendSessionCookie,
  getTotpStatus,
  regenerateTotpRecoveryCodes,
  requestPasswordReset,
  resetPasswordWithToken,
  setupTotp,
  signInToShare,
  signInWithEmail,
  signInWithTotp,
  signOutUser,
  signUpWithEmail,
  startOAuthSignIn,
} from './auth.service';

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const authRouter = createTRPCRouter({
  signOut: publicProcedure.mutation(async ({ ctx }) => {
    await signOutUser(ctx, ctx.setCookie, ctx.session?.session?.id);
  }),

  signInOAuth: publicProcedure
    .input(z.object({ provider: zProvider, inviteId: z.string().nullish() }))
    .mutation(({ input, ctx }) => startOAuthSignIn(input, ctx.setCookie)),

  signUpEmail: publicProcedure
    .input(zSignUpEmail)
    .mutation(({ input, ctx }) => signUpWithEmail(ctx, input, ctx.setCookie)),

  signInEmail: publicProcedure
    .input(zSignInEmail)
    .mutation(({ input, ctx }) =>
      signInWithEmail(ctx, input, ctx.setCookie, ctx.logger)
    ),

  signInTotp: publicProcedure
    .input(z.object({ code: zTotpOrRecoveryCode }))
    .mutation(({ input, ctx }) =>
      signInWithTotp(ctx, input, ctx.cookies, ctx.setCookie, ctx.logger)
    ),

  totpStatus: protectedProcedure.query(({ ctx }) =>
    getTotpStatus(ctx, requireLogin(ctx.session.userId))
  ),

  totpSetup: protectedProcedure.mutation(({ ctx }) =>
    setupTotp(ctx, requireLogin(ctx.session.userId))
  ),

  totpEnable: protectedProcedure
    .input(z.object({ code: zTotpCode }))
    .mutation(({ input, ctx }) =>
      enableTotp(ctx, requireLogin(ctx.session.userId), input.code)
    ),

  totpDisable: protectedProcedure
    .input(z.object({ code: zTotpOrRecoveryCode }))
    .mutation(({ input, ctx }) =>
      disableTotp(ctx, requireLogin(ctx.session.userId), input.code)
    ),

  totpRegenerateRecoveryCodes: protectedProcedure
    .input(z.object({ code: zTotpCode }))
    .mutation(({ input, ctx }) =>
      regenerateTotpRecoveryCodes(
        ctx,
        requireLogin(ctx.session.userId),
        input.code
      )
    ),

  resetPassword: publicProcedure
    .input(zResetPassword)
    .mutation(({ input, ctx }) => resetPasswordWithToken(ctx, input)),

  requestResetPassword: publicProcedure
    .input(zRequestResetPassword)
    .mutation(({ input, ctx }) => requestPasswordReset(ctx, input)),

  session: publicProcedure.query(({ ctx }) => ctx.session),

  extendSession: publicProcedure.mutation(({ ctx }) =>
    extendSessionCookie(
      ctx,
      ctx.cookies,
      Boolean(ctx.session.session),
      ctx.setCookie
    )
  ),

  signInShare: publicProcedure
    .input(zSignInShare)
    .mutation(({ input, ctx }) => signInToShare(ctx, input, ctx.setCookie)),
});
