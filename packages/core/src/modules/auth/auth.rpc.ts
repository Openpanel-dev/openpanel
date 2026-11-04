// Sign-in, sign-up, password reset and two-factor are better-auth's
// (`/api/auth/*`); what stays here reads the session or is not a sign-in.

import type { Session } from '../../context';
import {
  createRateLimitMiddleware,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '../../rpc/base';
import { enforceRateLimit } from '../../rpc/rate-limit';
import { zSignInDev, zSignInShare } from './auth.constants';
import {
  getConfiguredProviders,
  getTwoFactorStatus,
  signInToShare,
  signInWithDevLogin,
  signOutUser,
} from './auth.service';

const rateLimit = createRateLimitMiddleware(enforceRateLimit);

// The token is the cookie's value; the cookie is httpOnly so scripts never see it.
function withoutSessionToken(result: Session) {
  if (!result.session) {
    return result;
  }
  const { token: _token, ...session } = result.session;
  return { ...result, session };
}

export const authRouter = createTRPCRouter({
  /**
   * Which optional OAuth features this instance has credentials for, so the
   * dashboard can hide the social login and Search Console settings.
   * Booleans only: the client id/secret never leave the API.
   */
  providers: publicProcedure.query(({ ctx }) =>
    getConfiguredProviders(ctx.config)
  ),

  /** Ends either kind of session and clears both cookies. */
  signOut: publicProcedure.mutation(async ({ ctx }) => {
    await signOutUser(ctx, ctx.setCookie, ctx.session?.session?.id);
  }),

  /** One click on a local box; `DEV_LOGIN` cannot be set in production. */
  signInDev: publicProcedure
    .use(rateLimit({ max: 10, windowMs: 60_000 }))
    .input(zSignInDev)
    .mutation(({ input, ctx }) =>
      signInWithDevLogin(ctx, input, ctx.headers, ctx.setCookie)
    ),

  twoFactorStatus: protectedProcedure.query(({ ctx }) =>
    getTwoFactorStatus(ctx, ctx.session.userId)
  ),

  session: publicProcedure.query(({ ctx }) => withoutSessionToken(ctx.session)),

  signInShare: publicProcedure
    .use(rateLimit({ max: 3, windowMs: 30_000 }))
    .input(zSignInShare)
    .mutation(({ input, ctx }) =>
      signInToShare(ctx, () => ctx.services, input, ctx.setCookie)
    ),
});
