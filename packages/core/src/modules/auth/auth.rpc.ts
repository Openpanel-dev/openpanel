// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE the
// input parser. The explicit checks in the handlers below stay: `enforceAccess`
// only sees a TOP-LEVEL `projectId` / `organizationId`, so anything resolved
// from another id needs its own.
//
// Rate limits are mounted below through `createRateLimitMiddleware`
// (rpc/base.ts), procedure for procedure. Blocks are keyed per procedure and
// per trusted IP, and escalate on repeat offence — see rpc/rate-limit.ts.
//
// This module has no queue/cron of its own, so there is no `ctx.services.auth`
// entry here — same shape as `user`/`project`.

import { z } from 'zod';
import {
  createRateLimitMiddleware,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '../../rpc/base';
import { enforceRateLimit } from '../../rpc/rate-limit';
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
  getConfiguredProviders,
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

const rateLimit = createRateLimitMiddleware(enforceRateLimit);

export const authRouter = createTRPCRouter({
  /**
   * Which optional OAuth-backed features this instance has credentials for.
   * The dashboard hides the social login buttons and the Search Console
   * settings on a self-hosted instance that has not configured them.
   * Booleans only: the client id/secret never leave the API.
   */
  providers: publicProcedure.query(({ ctx }) =>
    getConfiguredProviders(ctx.config)
  ),

  signOut: publicProcedure.mutation(async ({ ctx }) => {
    await signOutUser(ctx, ctx.setCookie, ctx.session?.session?.id);
  }),

  signInOAuth: publicProcedure
    .input(z.object({ provider: zProvider, inviteId: z.string().nullish() }))
    .mutation(({ input, ctx }) => startOAuthSignIn(ctx, input, ctx.setCookie)),

  signUpEmail: publicProcedure
    .use(rateLimit({ max: 5, windowMs: 60_000 }))
    .input(zSignUpEmail)
    .mutation(({ input, ctx }) => signUpWithEmail(ctx, input, ctx.setCookie)),

  signInEmail: publicProcedure
    .use(rateLimit({ max: 3, windowMs: 30_000 }))
    .input(zSignInEmail)
    .mutation(({ input, ctx }) =>
      signInWithEmail(ctx, input, ctx.setCookie, ctx.logger)
    ),

  signInTotp: publicProcedure
    .use(rateLimit({ max: 5, windowMs: 60_000 }))
    .input(z.object({ code: zTotpOrRecoveryCode }))
    .mutation(({ input, ctx }) =>
      signInWithTotp(ctx, input, ctx.cookies, ctx.setCookie, ctx.logger)
    ),

  totpStatus: protectedProcedure.query(({ ctx }) =>
    getTotpStatus(ctx, ctx.session.userId)
  ),

  totpSetup: protectedProcedure.mutation(({ ctx }) =>
    setupTotp(ctx, ctx.session.userId)
  ),

  totpEnable: protectedProcedure
    .use(rateLimit({ max: 5, windowMs: 60_000 }))
    .input(z.object({ code: zTotpCode }))
    .mutation(({ input, ctx }) =>
      enableTotp(ctx, ctx.session.userId, input.code)
    ),

  totpDisable: protectedProcedure
    .use(rateLimit({ max: 5, windowMs: 60_000 }))
    .input(z.object({ code: zTotpOrRecoveryCode }))
    .mutation(({ input, ctx }) =>
      disableTotp(ctx, ctx.session.userId, input.code)
    ),

  totpRegenerateRecoveryCodes: protectedProcedure
    .use(rateLimit({ max: 3, windowMs: 60_000 }))
    .input(z.object({ code: zTotpCode }))
    .mutation(({ input, ctx }) =>
      regenerateTotpRecoveryCodes(ctx, ctx.session.userId, input.code)
    ),

  resetPassword: publicProcedure
    .use(rateLimit({ max: 3, windowMs: 60_000 }))
    .input(zResetPassword)
    .mutation(({ input, ctx }) => resetPasswordWithToken(ctx, input)),

  requestResetPassword: publicProcedure
    .use(rateLimit({ max: 3, windowMs: 60_000 }))
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
    .use(rateLimit({ max: 3, windowMs: 30_000 }))
    .input(zSignInShare)
    .mutation(({ input, ctx }) =>
      signInToShare(ctx, () => ctx.services, input, ctx.setCookie)
    ),
});
