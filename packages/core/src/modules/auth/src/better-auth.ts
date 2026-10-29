// Sign-in, sign-up, password reset and two-factor run on better-auth. Legacy
// `session` cookies still resolve (see `http/session.ts`) and are handed
// better-auth's cookie on the way out, until PR 4 drops them.

import type { Session, User } from '@openpanel/db/src/prisma-client';
import { APIError, type BetterAuthPlugin, betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { createAuthMiddleware, getOAuthState } from 'better-auth/api';
import { parseSetCookieHeader } from 'better-auth/cookies';
import { makeSignature } from 'better-auth/crypto';
import type { OAuth2Tokens } from 'better-auth/oauth2';
import { lastLoginMethod, twoFactor } from 'better-auth/plugins';
import {
  github as githubProvider,
  google as googleProvider,
} from 'better-auth/social-providers';
import { sendEmail } from '../../../clients/email';
import type { CoreConfig } from '../../../config';
import type { Db, RedisClient } from '../../../context';
import type { Logger } from '../../../logger';
import type { ISetCookie } from '../../../shared/cookie';
import { connectUserToOrganization } from '../../organization/organization.service';
import { INVITE_HEADER } from '../auth.constants';
import { cookieOptions } from './constants';
import { isOAuthClientConfigured } from './oauth';
import { hashPassword, verifyPasswordHash } from './password';
import { getIsRegistrationAllowed } from './registration';
import { generateSessionToken } from './token';

export const AUTH_BASE_PATH = '/api/auth';
const COOKIE_PREFIX = 'openpanel';
/** `${COOKIE_PREFIX}.session_token`, which is how better-auth names it. */
export const AUTH_SESSION_COOKIE = `${COOKIE_PREFIX}.session_token`;
/** Set by the HTTP mount from the trusted resolver; any incoming value is replaced. */
export const TRUSTED_IP_HEADER = 'x-openpanel-trusted-ip';
/** Holds the invite while a two-factor challenge is pending. */
const INVITE_COOKIE = 'inviteId';
/** Where a session can start, so where an invite is consumed. */
const SIGN_IN_PATHS = ['/sign-in/', '/sign-up/', '/callback/', '/two-factor/'];
const LAST_LOGIN_METHOD_COOKIE = 'last-auth-provider';

const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30;
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24 * 15;
const RESET_PASSWORD_TOKEN_SECONDS = 60 * 10;
const TWO_FACTOR_CHALLENGE_SECONDS = 60 * 10;
const LAST_LOGIN_METHOD_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 100;
const MIN_PASSWORD_LENGTH = 8;
const KEY_MISSING = -2;
const MAX_PASSWORD_LENGTH = 128;

/** What the dashboard calls. Everything else better-auth mounts answers 404. */
const EXPOSED_PATHS = new Set([
  '/ok',
  '/error',
  '/get-session',
  '/sign-in/email',
  '/sign-in/social',
  '/sign-up/email',
  '/sign-out',
  '/request-password-reset',
  '/reset-password',
]);
const EXPOSED_PREFIXES = ['/callback/', '/two-factor/'];

interface AuthDeps {
  db: Db;
  config: CoreConfig;
  logger: Logger;
  redis: RedisClient;
}

function isExposedPath(path: string): boolean {
  return (
    EXPOSED_PATHS.has(path) ||
    EXPOSED_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

const exposedPathsPlugin = {
  id: 'openpanel-exposed-paths',
  onRequest: async (request: Request) => {
    const path = new URL(request.url).pathname.slice(AUTH_BASE_PATH.length);
    if (isExposedPath(path)) {
      return;
    }
    return { response: new Response('Not Found', { status: 404 }) };
  },
} satisfies BetterAuthPlugin;

interface InviteSource {
  headers?: Headers;
  getCookie: (name: string) => string | null | undefined;
}

/** The invite rides a header (email), the OAuth state (social) or a cookie (2FA). */
async function readInviteId(ctx: InviteSource): Promise<string | undefined> {
  const fromHeader = ctx.headers?.get(INVITE_HEADER);
  if (fromHeader) {
    return fromHeader;
  }
  const state = await getOAuthState().catch(() => null);
  const fromState = state?.inviteId;
  if (typeof fromState === 'string' && fromState) {
    return fromState;
  }
  return ctx.getCookie(INVITE_COOKIE) ?? undefined;
}

function invitePlugin(deps: AuthDeps) {
  return {
    id: 'openpanel-invite',
    hooks: {
      after: [
        {
          matcher: (ctx: { path?: string }) =>
            SIGN_IN_PATHS.some((prefix) => ctx.path?.startsWith(prefix)),
          handler: createAuthMiddleware(async (ctx) => {
            const inviteId = await readInviteId(ctx);
            if (!inviteId) {
              return;
            }
            const signedIn = ctx.context.newSession;
            if (!signedIn) {
              // A password sign-in that now waits for a second factor.
              if (ctx.path === '/sign-in/email') {
                ctx.setCookie(INVITE_COOKIE, inviteId, {
                  ...cookieOptions(deps.config),
                  maxAge: TWO_FACTOR_CHALLENGE_SECONDS,
                });
              }
              return;
            }
            // Best effort: an expired invite must not undo the sign-in.
            await connectUserToOrganization(deps, {
              user: signedIn.user,
              inviteId,
            }).catch((error: unknown) => {
              deps.logger.error(
                { err: error, userId: signedIn.user.id, inviteId },
                'Failed to connect user to organization via invite'
              );
            });
            if (ctx.getCookie(INVITE_COOKIE)) {
              ctx.setCookie(INVITE_COOKIE, '', {
                ...cookieOptions(deps.config),
                maxAge: 0,
              });
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}

/** One counter per key, shared by every API process. */
function redisRateLimitStorage(redis: RedisClient) {
  return {
    consume: async (key: string, rule: { window: number; max: number }) => {
      const redisKey = `rl:auth:${key}`;
      const results = await redis
        .pipeline()
        .incr(redisKey)
        .ttl(redisKey)
        .exec();
      const hits = Number(results?.[0]?.[1] ?? 1);
      let ttl = Number(results?.[1]?.[1] ?? KEY_MISSING);
      // The window opens on the first hit; a counter without an expiry would
      // lock the caller out for good.
      if (hits === 1 || ttl < 0) {
        await redis.expire(redisKey, rule.window);
        ttl = rule.window;
      }
      if (hits <= rule.max) {
        return { allowed: true, retryAfter: null };
      }
      return { allowed: false, retryAfter: ttl };
    },
  };
}

interface ProviderUserInfo {
  user: { emailVerified: boolean };
}

/**
 * No user unless the provider verified the email, so nobody signs in or links
 * on an address they never proved they own. better-auth turns `null` into
 * `?error=unable_to_get_user_info`.
 */
function requireVerifiedEmail<T extends ProviderUserInfo>(
  getUserInfo: (token: OAuth2Tokens) => Promise<T | null>
) {
  return async (token: OAuth2Tokens): Promise<T | null> => {
    const info = await getUserInfo(token);
    return info?.user.emailVerified ? info : null;
  };
}

function socialProviders(config: CoreConfig) {
  const { google, github } = config.auth;
  const googleOptions = {
    clientId: google.clientId,
    clientSecret: google.clientSecret,
    // The URI registered at Google; its legacy path forwards here.
    redirectURI: google.redirectUri,
    mapProfileToUser: (profile: {
      given_name?: string;
      family_name?: string;
    }) => ({
      firstName: profile.given_name ?? '',
      lastName: profile.family_name ?? '',
    }),
  };
  const githubOptions = {
    clientId: github.clientId,
    clientSecret: github.clientSecret,
    redirectURI: github.redirectUri,
    // What users already granted: profile reads need no scope, so asking for
    // better-auth's default `read:user` would re-prompt every existing user.
    disableDefaultScope: true,
    scope: ['user:email'],
    mapProfileToUser: (profile: { name?: string | null; login: string }) => ({
      firstName: profile.name || profile.login,
      lastName: '',
    }),
  };
  return {
    ...(isOAuthClientConfigured(google) && {
      google: {
        ...googleOptions,
        getUserInfo: requireVerifiedEmail(
          googleProvider(googleOptions).getUserInfo
        ),
      },
    }),
    ...(isOAuthClientConfigured(github) && {
      github: {
        ...githubOptions,
        getUserInfo: requireVerifiedEmail(
          githubProvider(githubOptions).getUserInfo
        ),
      },
    }),
  };
}

function buildAuth(deps: AuthDeps, secret: string) {
  const { db, config, logger, redis } = deps;
  return betterAuth({
    secret,
    basePath: AUTH_BASE_PATH,
    trustedOrigins: config.auth.trustedOrigins,
    database: prismaAdapter(db, { provider: 'postgresql' }),
    telemetry: { enabled: false },
    logger: {
      log: (level, message, ...args) => {
        const log = level === 'error' || level === 'warn' ? level : 'info';
        logger[log]({ args }, `better-auth: ${message}`);
      },
    },
    onAPIError: { errorURL: `${config.dashboardUrl}/login` },
    user: {
      additionalFields: {
        firstName: { type: 'string', required: false, input: true },
        lastName: { type: 'string', required: false, input: true },
        deletedAt: { type: 'date', required: false, input: false },
      },
    },
    account: {
      // Our column for the provider's name. `providerId` is the legacy IdP id.
      fields: { providerId: 'provider' },
      // A Google or GitHub sign-in (verified email only, see
      // `requireVerifiedEmail`) joins the user who owns that email if that
      // user is verified too. Password-only users are never verified, so never
      // joined this way.
      accountLinking: { enabled: true },
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    socialProviders: socialProviders(config),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      resetPasswordTokenExpiresIn: RESET_PASSWORD_TOKEN_SECONDS,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPasswordHash(hash, password),
      },
      sendResetPassword: async ({ user, token }) => {
        const url = new URL('/reset-password', config.dashboardUrl);
        url.searchParams.set('token', token);
        await sendEmail('reset-password', {
          to: user.email,
          data: { url: url.toString() },
        });
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            const inviteId = ctx ? await readInviteId(ctx) : undefined;
            if (!(await getIsRegistrationAllowed(deps, inviteId))) {
              throw new APIError('FORBIDDEN', {
                code: 'REGISTRATION_NOT_ALLOWED',
                message: 'Registrations are not allowed',
              });
            }
            const name = [user.firstName, user.lastName]
              .filter(Boolean)
              .join(' ')
              .trim();
            return { data: { ...user, name: name || user.name } };
          },
        },
      },
    },
    rateLimit: {
      enabled: true,
      window: RATE_LIMIT_WINDOW_SECONDS,
      max: RATE_LIMIT_MAX,
      customStorage: redisRateLimitStorage(redis),
    },
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      // The name stays `openpanel.session_token` on https too; `Secure` comes
      // from the same options as the legacy cookie.
      useSecureCookies: false,
      defaultCookieAttributes: cookieOptions(config),
      ipAddress: { ipAddressHeaders: [TRUSTED_IP_HEADER] },
    },
    plugins: [
      exposedPathsPlugin,
      twoFactor({
        issuer: 'OpenPanel',
        twoFactorCookieMaxAge: TWO_FACTOR_CHALLENGE_SECONDS,
      }),
      lastLoginMethod({
        cookieName: LAST_LOGIN_METHOD_COOKIE,
        maxAge: LAST_LOGIN_METHOD_MAX_AGE_SECONDS,
        customResolveMethod: (ctx) =>
          ctx.path.startsWith('/two-factor/') ? 'email' : null,
      }),
      // After `twoFactor`, so a sign-in still waiting for its second factor
      // has no session yet and keeps the invite for later.
      invitePlugin(deps),
    ],
  });
}

export type Auth = ReturnType<typeof buildAuth>;

/** Null without a secret: sessions then resolve through the legacy cookie only. */
export function createAuth(deps: AuthDeps): Auth | null {
  const secret = deps.config.auth.secret;
  if (!secret) {
    deps.logger.warn(
      'AUTH_SECRET and COOKIE_SECRET are unset; sign-in is unavailable and only legacy sessions resolve'
    );
    return null;
  }
  return buildAuth(deps, secret);
}

export interface AuthSessionResult {
  session: Session;
  user: User;
  userId: string;
}

/**
 * Re-sets the cookies better-auth wrote, so a refreshed session's cookie
 * reaches the browser through whichever transport is answering.
 */
function forwardSetCookies(
  config: CoreConfig,
  headers: Headers,
  setCookie: ISetCookie
): void {
  for (const header of headers.getSetCookie()) {
    for (const [name, cookie] of parseSetCookieHeader(header)) {
      setCookie(name, cookie.value, {
        ...cookieOptions(config),
        maxAge: cookie['max-age'],
      });
    }
  }
}

/** The better-auth session in the request's cookies, in our row types. */
export async function getAuthSession(
  auth: Auth,
  config: CoreConfig,
  headers: Headers,
  setCookie: ISetCookie
): Promise<AuthSessionResult | null> {
  if (!headers.get('cookie')?.includes(AUTH_SESSION_COOKIE)) {
    return null;
  }
  const response = await auth.api
    .getSession({ headers, returnHeaders: true })
    .catch((error: unknown) => {
      // A refresh racing a sign-out; anything else is the database.
      if (error instanceof APIError) {
        return null;
      }
      throw error;
    });
  if (!response) {
    return null;
  }
  forwardSetCookies(config, response.headers, setCookie);
  const result = response.response;
  if (!result) {
    return null;
  }
  const { session, user } = result;
  return {
    userId: user.id,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      image: user.image ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      twoFactorEnabled: user.twoFactorEnabled ?? false,
      deletedAt: user.deletedAt ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    session: {
      id: session.id,
      token: session.token,
      userId: session.userId,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress ?? null,
      userAgent: session.userAgent ?? null,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
  };
}

export type PasswordSignInResult =
  | { type: 'signed_in' }
  | { type: 'two_factor' };

/** A server-side email sign-in whose cookies go out through `setCookie`. */
export async function signInWithPassword(
  auth: Auth,
  config: CoreConfig,
  credentials: { email: string; password: string },
  headers: Headers,
  setCookie: ISetCookie
): Promise<PasswordSignInResult> {
  const result = await auth.api.signInEmail({
    body: credentials,
    headers,
    returnHeaders: true,
  });
  forwardSetCookies(config, result.headers, setCookie);
  return 'twoFactorRedirect' in result.response
    ? { type: 'two_factor' }
    : { type: 'signed_in' };
}

/**
 * The token better-auth knows this session by. It is its own random value, never
 * the legacy cookie's: that cookie is unsigned, so storing it would let a
 * database read sign in.
 */
async function claimAuthToken(db: Db, session: Session): Promise<string> {
  if (session.token) {
    return session.token;
  }
  const token = generateSessionToken();
  const claimed = await db.session.updateMany({
    where: { id: session.id, token: null },
    data: { token },
  });
  if (claimed.count > 0) {
    return token;
  }
  // A concurrent request upgraded it first.
  const row = await db.session.findUniqueOrThrow({
    where: { id: session.id },
    select: { token: true },
  });
  return row.token ?? token;
}

/**
 * Gives a legacy session better-auth's cookie on the same row, so the session
 * keeps its id and expiry and signing out either way ends both.
 */
export async function upgradeLegacySession(
  { db, config }: Pick<AuthDeps, 'db' | 'config'>,
  secret: string,
  session: Session,
  setCookie: ISetCookie
): Promise<void> {
  const token = await claimAuthToken(db, session);
  const signature = await makeSignature(token, secret);
  setCookie(AUTH_SESSION_COOKIE, `${token}.${signature}`, {
    ...cookieOptions(config),
    maxAge: Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
  });
}

export function deleteAuthSessionCookie(
  config: CoreConfig,
  setCookie: ISetCookie
): void {
  setCookie(AUTH_SESSION_COOKIE, '', { ...cookieOptions(config), maxAge: 0 });
}
