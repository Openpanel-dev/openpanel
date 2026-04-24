import {
  Arctic,
  buildOtpauthUrl,
  consumeRecoveryCode,
  COOKIE_OPTIONS,
  createSession,
  deleteSessionTokenCookie,
  generateQrDataUrl,
  generateRecoveryCodes,
  generateSessionToken,
  generateTotpSecret,
  github,
  google,
  hashPassword,
  hashRecoveryCodes,
  invalidateSession,
  setLastAuthProviderCookie,
  setSessionTokenCookie,
  validateSessionToken,
  verifyPasswordHash,
  verifyTotpCode,
} from '@openpanel/auth';
import { generateSecureId } from '@openpanel/common/server';
import {
  connectUserToOrganization,
  db,
  decrypt,
  encrypt,
  getShareOverviewById,
  getUserAccount,
} from '@openpanel/db';
import { sendEmail } from '@openpanel/email';
import {
  zRequestResetPassword,
  zResetPassword,
  zSignInEmail,
  zSignInShare,
  zSignUpEmail,
  zTotpCode,
  zTotpOrRecoveryCode,
} from '@openpanel/validation';
import { z } from 'zod';
import { TRPCAccessError, TRPCNotFoundError } from '../errors';
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  rateLimitMiddleware,
} from '../trpc';

const TWO_FACTOR_COOKIE = '2fa_challenge';
const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 5 * 60;

const zProvider = z.enum(['email', 'google', 'github']);

async function getIsRegistrationAllowed(inviteId?: string | null) {
  // ALLOW_REGISTRATION is always undefined in cloud
  if (process.env.ALLOW_REGISTRATION === undefined) {
    return true;
  }

  // Self-hosting logic
  // 1. First user is always allowed
  const count = await db.user.count();
  if (count === 0) {
    return true;
  }

  // 2. If there is an invite, check if it is valid
  if (inviteId) {
    if (process.env.ALLOW_INVITATION === 'false') {
      return false;
    }

    const invite = await db.invite.findUnique({
      where: {
        id: inviteId,
      },
    });

    return !!invite;
  }

  // 3. Otherwise, check if general registration is allowed
  return process.env.ALLOW_REGISTRATION !== 'false';
}

export const authRouter = createTRPCRouter({
  signOut: publicProcedure.mutation(async ({ ctx }) => {
    deleteSessionTokenCookie(ctx.setCookie);
    if (ctx.session?.session?.id) {
      await invalidateSession(ctx.session.session.id);
    }
  }),
  signInOAuth: publicProcedure
    .input(z.object({ provider: zProvider, inviteId: z.string().nullish() }))
    .mutation(async ({ input, ctx }) => {
      const isRegistrationAllowed = await getIsRegistrationAllowed(
        input.inviteId
      );

      if (!isRegistrationAllowed) {
        throw TRPCAccessError('Registrations are not allowed');
      }

      const { provider } = input;

      if (input.inviteId) {
        ctx.setCookie('inviteId', input.inviteId, {
          maxAge: 60 * 10,
        });
      }

      if (provider === 'github') {
        const state = Arctic.generateState();
        const url = github.createAuthorizationURL(state, [
          'user:email',
          'user:read',
        ]);

        ctx.setCookie('github_oauth_state', state, {
          maxAge: 60 * 10,
        });

        return {
          type: 'github',
          url: url.toString(),
        };
      }

      const state = Arctic.generateState();
      const codeVerifier = Arctic.generateCodeVerifier();
      const url = google.createAuthorizationURL(state, codeVerifier, [
        'openid',
        'profile',
        'email',
      ]);

      ctx.setCookie('google_oauth_state', state, {
        maxAge: 60 * 10,
      });
      ctx.setCookie('google_code_verifier', codeVerifier, {
        maxAge: 60 * 10,
      });

      return {
        type: 'google',
        url: url.toString(),
      };
    }),
  signUpEmail: publicProcedure
    .input(zSignUpEmail)
    .mutation(async ({ input, ctx }) => {
      const isRegistrationAllowed = await getIsRegistrationAllowed(
        input.inviteId
      );

      if (!isRegistrationAllowed) {
        throw TRPCAccessError('Registrations are not allowed');
      }

      const provider = 'email';
      const user = await getUserAccount({
        email: input.email,
        provider,
      });

      if (user) {
        throw TRPCNotFoundError('User already exists');
      }

      const createdUser = await db.user.create({
        data: {
          id: generateSecureId('user'),
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          accounts: {
            create: {
              provider,
              password: await hashPassword(input.password),
            },
          },
        },
      });

      if (input.inviteId) {
        await connectUserToOrganization({
          user: createdUser,
          inviteId: input.inviteId,
        });
      }

      const token = generateSessionToken();
      const session = await createSession(token, createdUser.id);

      setSessionTokenCookie(ctx.setCookie, token, session.expiresAt);
      return session;
    }),
  signInEmail: publicProcedure
    .use(
      rateLimitMiddleware({
        max: 3,
        windowMs: 30_000,
      })
    )
    .input(zSignInEmail)
    .mutation(async ({ input, ctx }) => {
      const provider = 'email';
      const password = input.password.trim();

      const user = await getUserAccount({
        email: input.email,
        provider,
      });

      if (!user) {
        throw TRPCNotFoundError('User does not exists');
      }

      if (provider === 'email') {
        // if the password starts with $argon2 we use the new password hashing
        // otherwise its legacy from Clerk which uses bcrypt
        // TODO: Remove this after 2025-06-01 (half year from now)
        if (user.account.password?.startsWith('$argon2')) {
          const validPassword = await verifyPasswordHash(
            user.account.password ?? '',
            password
          );

          if (!validPassword) {
            throw TRPCAccessError('Incorrect email or password');
          }
        } else {
          throw TRPCAccessError(
            'Reset your password, old password has expired'
          );
        }
      }

      const totp = await db.userTotp.findUnique({
        where: { userId: user.id },
      });
      if (totp?.enabledAt) {
        const challengeId = generateSecureId('2fa');
        await db.twoFactorChallenge.create({
          data: {
            id: challengeId,
            userId: user.id,
            expiresAt: new Date(
              Date.now() + TWO_FACTOR_CHALLENGE_TTL_SECONDS * 1000,
            ),
          },
        });
        ctx.setCookie(TWO_FACTOR_COOKIE, challengeId, {
          maxAge: TWO_FACTOR_CHALLENGE_TTL_SECONDS,
        });
        return { type: 'totp_required' as const };
      }

      const token = generateSessionToken();
      const session = await createSession(token, user.id);
      setSessionTokenCookie(ctx.setCookie, token, session.expiresAt);
      setLastAuthProviderCookie(ctx.setCookie, 'email');
      return {
        type: 'email' as const,
      };
    }),

  signInTotp: publicProcedure
    .use(
      rateLimitMiddleware({
        max: 5,
        windowMs: 60_000,
      })
    )
    .input(z.object({ code: zTotpOrRecoveryCode }))
    .mutation(async ({ input, ctx }) => {
      const challengeId = ctx.cookies[TWO_FACTOR_COOKIE];
      if (!challengeId) {
        throw TRPCAccessError('No active two-factor challenge');
      }

      const challenge = await db.twoFactorChallenge.findUnique({
        where: { id: challengeId },
      });

      if (!challenge || challenge.expiresAt < new Date()) {
        if (challenge) {
          await db.twoFactorChallenge.delete({ where: { id: challenge.id } });
        }
        ctx.setCookie(TWO_FACTOR_COOKIE, '', { maxAge: 0 });
        throw TRPCAccessError('Two-factor challenge has expired');
      }

      const totp = await db.userTotp.findUnique({
        where: { userId: challenge.userId },
      });
      if (!totp?.enabledAt) {
        await db.twoFactorChallenge.delete({ where: { id: challenge.id } });
        ctx.setCookie(TWO_FACTOR_COOKIE, '', { maxAge: 0 });
        throw TRPCAccessError('Two-factor is not enabled');
      }

      const secret = decrypt(totp.secret);
      const isTotpCode = /^\d{6}$/.test(input.code.replace(/\s+/g, ''));
      let valid = false;

      if (isTotpCode) {
        valid = verifyTotpCode(secret, input.code);
      } else {
        const result = await consumeRecoveryCode({
          hashes: totp.recoveryCodes,
          input: input.code,
        });
        if (result.valid) {
          valid = true;
          await db.userTotp.update({
            where: { userId: challenge.userId },
            data: { recoveryCodes: result.remaining },
          });
        }
      }

      if (!valid) {
        throw TRPCAccessError('Invalid code');
      }

      await db.twoFactorChallenge.delete({ where: { id: challenge.id } });
      ctx.setCookie(TWO_FACTOR_COOKIE, '', { maxAge: 0 });

      const token = generateSessionToken();
      const session = await createSession(token, challenge.userId);
      setSessionTokenCookie(ctx.setCookie, token, session.expiresAt);
      setLastAuthProviderCookie(ctx.setCookie, 'email');
      return { type: 'email' as const };
    }),

  totpStatus: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.userId!;
    const [totp, emailAccount] = await Promise.all([
      db.userTotp.findUnique({ where: { userId } }),
      db.account.findFirst({
        where: { userId, provider: 'email' },
        select: { id: true },
      }),
    ]);
    return {
      enabled: Boolean(totp?.enabledAt),
      enabledAt: totp?.enabledAt ?? null,
      remainingRecoveryCodes: totp?.recoveryCodes.length ?? 0,
      hasEmailProvider: Boolean(emailAccount),
    };
  }),

  totpSetup: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.userId!;
    const emailAccount = await db.account.findFirst({
      where: { userId, provider: 'email' },
      select: { id: true },
    });
    if (!emailAccount) {
      throw TRPCAccessError(
        'Two-factor authentication is only available for email/password sign-ins. Your account uses a social provider, which handles 2FA on its end.',
      );
    }
    const existing = await db.userTotp.findUnique({ where: { userId } });
    if (existing?.enabledAt) {
      throw TRPCAccessError(
        'Two-factor is already enabled. Disable it first to re-configure.',
      );
    }

    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });

    const secret = generateTotpSecret();
    const otpauthUrl = buildOtpauthUrl({
      secret,
      accountName: user.email,
    });
    const qrDataUrl = await generateQrDataUrl(otpauthUrl);

    await db.userTotp.upsert({
      where: { userId },
      create: {
        userId,
        secret: encrypt(secret),
        recoveryCodes: [],
      },
      update: {
        secret: encrypt(secret),
        recoveryCodes: [],
        enabledAt: null,
      },
    });

    return { otpauthUrl, qrDataUrl, secret };
  }),

  totpEnable: protectedProcedure
    .use(rateLimitMiddleware({ max: 5, windowMs: 60_000 }))
    .input(z.object({ code: zTotpCode }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.userId!;
      const totp = await db.userTotp.findUnique({ where: { userId } });
      if (!totp) {
        throw TRPCNotFoundError('Start two-factor setup first');
      }
      if (totp.enabledAt) {
        throw TRPCAccessError('Two-factor is already enabled');
      }

      const secret = decrypt(totp.secret);
      if (!verifyTotpCode(secret, input.code)) {
        throw TRPCAccessError('Invalid code');
      }

      const recoveryCodes = generateRecoveryCodes();
      const hashed = await hashRecoveryCodes(recoveryCodes);

      await db.userTotp.update({
        where: { userId },
        data: {
          enabledAt: new Date(),
          recoveryCodes: hashed,
        },
      });

      return { recoveryCodes };
    }),

  totpDisable: protectedProcedure
    .use(rateLimitMiddleware({ max: 5, windowMs: 60_000 }))
    .input(z.object({ code: zTotpOrRecoveryCode }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.userId!;
      const totp = await db.userTotp.findUnique({ where: { userId } });
      if (!totp?.enabledAt) {
        throw TRPCAccessError('Two-factor is not enabled');
      }

      const secret = decrypt(totp.secret);
      const isTotpCode = /^\d{6}$/.test(input.code.replace(/\s+/g, ''));
      const valid = isTotpCode
        ? verifyTotpCode(secret, input.code)
        : (
            await consumeRecoveryCode({
              hashes: totp.recoveryCodes,
              input: input.code,
            })
          ).valid;

      if (!valid) {
        throw TRPCAccessError('Invalid code');
      }

      await db.userTotp.delete({ where: { userId } });
      await db.twoFactorChallenge.deleteMany({ where: { userId } });
      return { disabled: true };
    }),

  totpRegenerateRecoveryCodes: protectedProcedure
    .use(rateLimitMiddleware({ max: 3, windowMs: 60_000 }))
    .input(z.object({ code: zTotpCode }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.userId!;
      const totp = await db.userTotp.findUnique({ where: { userId } });
      if (!totp?.enabledAt) {
        throw TRPCAccessError('Two-factor is not enabled');
      }
      const secret = decrypt(totp.secret);
      if (!verifyTotpCode(secret, input.code)) {
        throw TRPCAccessError('Invalid code');
      }
      const recoveryCodes = generateRecoveryCodes();
      const hashed = await hashRecoveryCodes(recoveryCodes);
      await db.userTotp.update({
        where: { userId },
        data: { recoveryCodes: hashed },
      });
      return { recoveryCodes };
    }),

  resetPassword: publicProcedure
    .input(zResetPassword)
    .use(
      rateLimitMiddleware({
        max: 3,
        windowMs: 60_000,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { token, password } = input;

      const resetPassword = await db.resetPassword.findUnique({
        where: {
          id: token,
        },
      });

      if (!resetPassword) {
        throw TRPCNotFoundError('Reset password not found');
      }

      if (resetPassword.expiresAt < new Date()) {
        throw TRPCNotFoundError('Reset password expired');
      }

      await db.account.update({
        where: { id: resetPassword.accountId },
        data: {
          password: await hashPassword(password),
        },
      });

      await db.resetPassword.delete({
        where: { id: token },
      });

      return true;
    }),

  requestResetPassword: publicProcedure
    .use(
      rateLimitMiddleware({
        max: 3,
        windowMs: 60_000,
      })
    )
    .input(zRequestResetPassword)
    .mutation(async ({ input, ctx }) => {
      const user = await getUserAccount({
        email: input.email,
        provider: 'email',
      });

      if (!user) {
        return true;
      }

      if (!user.account.id) {
        return true;
      }

      await db.resetPassword.deleteMany({
        where: {
          accountId: user.account.id,
        },
      });

      const token = generateSecureId('pw');
      // expires in 10 minutes
      const expiresAt = new Date(Date.now() + 1000 * 60 * 10);

      await db.resetPassword.create({
        data: {
          id: token,
          expiresAt,
          accountId: user.account.id,
        },
      });

      await sendEmail('reset-password', {
        to: input.email,
        data: {
          url: `${process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL}/reset-password?token=${token}`,
        },
      });

      return true;
    }),
  session: publicProcedure.query(async ({ ctx }) => {
    return ctx.session;
  }),

  extendSession: publicProcedure.mutation(async ({ ctx }) => {
    if (!(ctx.session.session && ctx.cookies.session)) {
      return { extended: false };
    }

    const token = ctx.cookies.session;
    const session = await validateSessionToken(token);

    if (session.session) {
      // Re-set the cookie with updated expiration
      setSessionTokenCookie(ctx.setCookie, token, session.session.expiresAt);
      return {
        extended: true,
        expiresAt: session.session.expiresAt,
      };
    }

    return { extended: false };
  }),

  signInShare: publicProcedure
    .use(
      rateLimitMiddleware({
        max: 3,
        windowMs: 30_000,
      })
    )
    .input(zSignInShare)
    .mutation(async ({ input, ctx }) => {
      const { password, shareId, shareType = 'overview' } = input;
      let share: { password: string | null; public: boolean } | null = null;
      let cookieName = '';

      if (shareType === 'overview') {
        share = await getShareOverviewById(shareId);
        cookieName = `shared-overview-${shareId}`;
      } else if (shareType === 'dashboard') {
        const { getShareDashboardById } = await import('@openpanel/db');
        share = await getShareDashboardById(shareId);
        cookieName = `shared-dashboard-${shareId}`;
      } else if (shareType === 'report') {
        const { getShareReportById } = await import('@openpanel/db');
        share = await getShareReportById(shareId);
        cookieName = `shared-report-${shareId}`;
      }

      if (!share) {
        throw TRPCNotFoundError('Share not found');
      }

      if (!share.public) {
        throw TRPCNotFoundError('Share is not public');
      }

      if (!share.password) {
        throw TRPCNotFoundError('Share is not password protected');
      }

      const validPassword = await verifyPasswordHash(share.password, password);

      if (!validPassword) {
        throw TRPCAccessError('Incorrect password');
      }

      ctx.setCookie(cookieName, '1', {
        maxAge: 60 * 60 * 24 * 7,
        ...COOKIE_OPTIONS,
      });

      return true;
    }),
});
