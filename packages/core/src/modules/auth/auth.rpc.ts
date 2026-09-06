// Ported from packages/trpc/src/routers/auth.ts (M6-003).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). This
// router is the first to reach that comment and deliberately does not
// resolve it: wiring a full protectedProcedure (runWithAlsSession, the
// Redis-backed rate limiter) onto core's rpc/base.ts is a bigger change than
// "the auth router moves" and is left for the task that actually mounts
// `dashboardRoutes` in production (P3/P4/P8). Until then this router does
// its own minimal "is anyone logged in" check inline, same as
// organization.rpc.ts/project.rpc.ts. V1 keeps serving the live route
// through packages/trpc's own `protectedProcedure` (full stack, including
// rate limiting) and delegates every handler body to `./auth.service`
// (DELEGATE PATTERN) — the same functions this router calls.
//
// This module has no queue/cron of its own, so there is no
// `ctx.services.auth` entry here — same shape as `user`/`project`.

import {
  zProvider,
  zRequestResetPassword,
  zResetPassword,
  zSignInEmail,
  zSignInShare,
  zSignUpEmail,
  zTotpCode,
  zTotpOrRecoveryCode,
} from '@openpanel/validation';
import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
import { TRPCAccessError } from '../../rpc/errors';
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
  signOut: procedure.mutation(async ({ ctx }) => {
    await signOutUser(ctx, ctx.setCookie, ctx.session?.session?.id);
  }),

  signInOAuth: procedure
    .input(z.object({ provider: zProvider, inviteId: z.string().nullish() }))
    .mutation(({ input, ctx }) => startOAuthSignIn(input, ctx.setCookie)),

  signUpEmail: procedure
    .input(zSignUpEmail)
    .mutation(({ input, ctx }) => signUpWithEmail(ctx, input, ctx.setCookie)),

  signInEmail: procedure
    .input(zSignInEmail)
    .mutation(({ input, ctx }) =>
      signInWithEmail(ctx, input, ctx.setCookie, ctx.logger)
    ),

  signInTotp: procedure
    .input(z.object({ code: zTotpOrRecoveryCode }))
    .mutation(({ input, ctx }) =>
      signInWithTotp(ctx, input, ctx.cookies, ctx.setCookie, ctx.logger)
    ),

  totpStatus: procedure.query(({ ctx }) =>
    getTotpStatus(ctx, requireLogin(ctx.session.userId))
  ),

  totpSetup: procedure.mutation(({ ctx }) =>
    setupTotp(ctx, requireLogin(ctx.session.userId))
  ),

  totpEnable: procedure
    .input(z.object({ code: zTotpCode }))
    .mutation(({ input, ctx }) =>
      enableTotp(ctx, requireLogin(ctx.session.userId), input.code)
    ),

  totpDisable: procedure
    .input(z.object({ code: zTotpOrRecoveryCode }))
    .mutation(({ input, ctx }) =>
      disableTotp(ctx, requireLogin(ctx.session.userId), input.code)
    ),

  totpRegenerateRecoveryCodes: procedure
    .input(z.object({ code: zTotpCode }))
    .mutation(({ input, ctx }) =>
      regenerateTotpRecoveryCodes(
        ctx,
        requireLogin(ctx.session.userId),
        input.code
      )
    ),

  resetPassword: procedure
    .input(zResetPassword)
    .mutation(({ input, ctx }) => resetPasswordWithToken(ctx, input)),

  requestResetPassword: procedure
    .input(zRequestResetPassword)
    .mutation(({ input, ctx }) => requestPasswordReset(ctx, input)),

  session: procedure.query(({ ctx }) => ctx.session),

  extendSession: procedure.mutation(({ ctx }) =>
    extendSessionCookie(
      ctx,
      ctx.cookies,
      Boolean(ctx.session.session),
      ctx.setCookie
    )
  ),

  signInShare: procedure
    .input(zSignInShare)
    .mutation(({ input, ctx }) => signInToShare(ctx, input, ctx.setCookie)),
});
