// Dissolved into @openpanel/core's auth module (M6-003): sign-up/sign-in,
// TOTP challenges, password reset and share unlock moved to
// packages/core/src/modules/auth/auth.service.ts. This router stays
// (DELEGATE PATTERN) — it keeps V1's rate-limiting/protectedProcedure stack
// and delegates every handler body to core's auth functions, same as
// organization's router does (M6-001).

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
} from '@openpanel/core';
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
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  rateLimitMiddleware,
} from '../trpc';

export const authRouter = createTRPCRouter({
  signOut: publicProcedure.mutation(async ({ ctx }) => {
    await signOutUser(ctx.setCookie, ctx.session?.session?.id);
  }),
  signInOAuth: publicProcedure
    .input(z.object({ provider: zProvider, inviteId: z.string().nullish() }))
    .mutation(({ input, ctx }) => startOAuthSignIn(input, ctx.setCookie)),
  signUpEmail: publicProcedure
    .use(rateLimitMiddleware({ max: 5, windowMs: 60_000 }))
    .input(zSignUpEmail)
    .mutation(({ input, ctx }) => signUpWithEmail(input, ctx.setCookie)),
  signInEmail: publicProcedure
    .use(rateLimitMiddleware({ max: 3, windowMs: 30_000 }))
    .input(zSignInEmail)
    .mutation(({ input, ctx }) =>
      signInWithEmail(input, ctx.setCookie, ctx.logger)
    ),
  signInTotp: publicProcedure
    .use(rateLimitMiddleware({ max: 5, windowMs: 60_000 }))
    .input(z.object({ code: zTotpOrRecoveryCode }))
    .mutation(({ input, ctx }) =>
      signInWithTotp(input, ctx.cookies, ctx.setCookie, ctx.logger)
    ),

  totpStatus: protectedProcedure.query(({ ctx }) =>
    getTotpStatus(ctx.session.userId!)
  ),

  totpSetup: protectedProcedure.mutation(({ ctx }) =>
    setupTotp(ctx.session.userId!)
  ),

  totpEnable: protectedProcedure
    .use(rateLimitMiddleware({ max: 5, windowMs: 60_000 }))
    .input(z.object({ code: zTotpCode }))
    .mutation(({ ctx, input }) => enableTotp(ctx.session.userId!, input.code)),

  totpDisable: protectedProcedure
    .use(rateLimitMiddleware({ max: 5, windowMs: 60_000 }))
    .input(z.object({ code: zTotpOrRecoveryCode }))
    .mutation(({ ctx, input }) => disableTotp(ctx.session.userId!, input.code)),

  totpRegenerateRecoveryCodes: protectedProcedure
    .use(rateLimitMiddleware({ max: 3, windowMs: 60_000 }))
    .input(z.object({ code: zTotpCode }))
    .mutation(({ ctx, input }) =>
      regenerateTotpRecoveryCodes(ctx.session.userId!, input.code)
    ),

  resetPassword: publicProcedure
    .input(zResetPassword)
    .use(rateLimitMiddleware({ max: 3, windowMs: 60_000 }))
    .mutation(({ input }) => resetPasswordWithToken(input)),

  requestResetPassword: publicProcedure
    .use(rateLimitMiddleware({ max: 3, windowMs: 60_000 }))
    .input(zRequestResetPassword)
    .mutation(({ input }) => requestPasswordReset(input)),

  session: publicProcedure.query(({ ctx }) => ctx.session),

  extendSession: publicProcedure.mutation(({ ctx }) =>
    extendSessionCookie(
      ctx.cookies,
      Boolean(ctx.session.session),
      ctx.setCookie
    )
  ),

  signInShare: publicProcedure
    .use(rateLimitMiddleware({ max: 3, windowMs: 30_000 }))
    .input(zSignInShare)
    .mutation(({ input, ctx }) => signInToShare(input, ctx.setCookie)),
});
