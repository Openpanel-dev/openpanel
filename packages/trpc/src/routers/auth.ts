import {
  Arctic,
  COOKIE_OPTIONS,
  createSession,
  deleteSessionTokenCookie,
  generateSessionToken,
  github,
  google,
  hashPassword,
  invalidateSession,
  setSessionTokenCookie,
  verifyPasswordHash,
} from '@openpanel/auth';
import { generateSecureId } from '@openpanel/common/server/id';
import {
  connectUserToOrganization,
  db,
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
} from '@openpanel/validation';
import * as bcrypt from 'bcrypt';
import { z } from 'zod';
import { TRPCAccessError, TRPCNotFoundError } from '../errors';
import {
  createTRPCRouter,
  publicProcedure,
  rateLimitMiddleware,
} from '../trpc';

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
        input.inviteId,
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
        input.inviteId,
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
      }),
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
            password,
          );

          if (!validPassword) {
            throw TRPCAccessError('Incorrect email or password');
          }
        } else {
          const validPassword = await bcrypt.compare(
            password,
            user.account.password ?? '',
          );

          if (!validPassword) {
            throw TRPCAccessError('Incorrect email or password');
          }
        }
      }

      const token = generateSessionToken();
      const session = await createSession(token, user.id);

      setSessionTokenCookie(ctx.setCookie, token, session.expiresAt);
      return {
        type: 'email',
      };
    }),

  resetPassword: publicProcedure
    .input(zResetPassword)
    .use(
      rateLimitMiddleware({
        max: 3,
        windowMs: 60_000,
      }),
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
      }),
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
          url: `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/reset-password?token=${token}`,
        },
      });

      return true;
    }),
  session: publicProcedure.query(async ({ ctx }) => {
    return ctx.session;
  }),

  signInShare: publicProcedure
    .use(
      rateLimitMiddleware({
        max: 3,
        windowMs: 30_000,
      }),
    )
    .input(zSignInShare)
    .mutation(async ({ input, ctx }) => {
      const { password, shareId } = input;
      const share = await getShareOverviewById(input.shareId);

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

      ctx.setCookie(`shared-overview-${shareId}`, '1', {
        maxAge: 60 * 60 * 24 * 7,
        ...COOKIE_OPTIONS,
      });

      return true;
    }),
});
