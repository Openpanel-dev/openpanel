// better-auth, installed but inert: only `/get-session` answers over HTTP and
// no flow creates users or sessions through it yet. What it does do is read
// its own session cookie, which `resolveSession` hands out to legacy sessions
// as they are used, so the switch of sign-in to better-auth signs nobody out.

import type { Session, User } from '@openpanel/db/src/prisma-client';
import { APIError, type BetterAuthPlugin, betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { parseSetCookieHeader } from 'better-auth/cookies';
import { makeSignature } from 'better-auth/crypto';
import type { CoreConfig } from '../../../config';
import type { Db } from '../../../context';
import type { Logger } from '../../../logger';
import type { ISetCookie } from '../../../shared/cookie';
import { cookieOptions } from './constants';
import { hashPassword, verifyPasswordHash } from './password';
import { generateSessionToken } from './token';

export const AUTH_BASE_PATH = '/api/auth';
const COOKIE_PREFIX = 'openpanel';
/** `${COOKIE_PREFIX}.session_token`, which is how better-auth names it. */
export const AUTH_SESSION_COOKIE = `${COOKIE_PREFIX}.session_token`;

// The legacy session's lifetime and renewal rule, so a session keeps its
// expiry whichever cookie resolved it.
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30;
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24 * 15;

const OPEN_PATHS = new Set(['/get-session', '/ok']);

interface AuthDeps {
  db: Db;
  config: CoreConfig;
  logger: Logger;
}

/** Answers 404 for everything but the open paths until sign-in moves here. */
const inertPlugin = {
  id: 'openpanel-inert',
  onRequest: async (request: Request) => {
    const path = new URL(request.url).pathname.slice(AUTH_BASE_PATH.length);
    if (OPEN_PATHS.has(path)) {
      return;
    }
    return { response: new Response('Not Found', { status: 404 }) };
  },
} satisfies BetterAuthPlugin;

function buildAuth({ db, config, logger }: AuthDeps, secret: string) {
  return betterAuth({
    secret,
    basePath: AUTH_BASE_PATH,
    trustedOrigins: config.dashboardUrl ? [config.dashboardUrl] : [],
    database: prismaAdapter(db, { provider: 'postgresql' }),
    telemetry: { enabled: false },
    logger: {
      log: (level, message, ...args) => {
        const log = level === 'error' || level === 'warn' ? level : 'info';
        logger[log]({ args }, `better-auth: ${message}`);
      },
    },
    user: {
      additionalFields: {
        firstName: { type: 'string', required: false, input: false },
        lastName: { type: 'string', required: false, input: false },
        deletedAt: { type: 'date', required: false, input: false },
      },
    },
    account: {
      // Our column for the provider's name. `providerId` is the legacy IdP id.
      fields: { providerId: 'provider' },
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPasswordHash(hash, password),
      },
    },
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      // The name stays `openpanel.session_token` on https too; `Secure` comes
      // from the same options as the legacy cookie.
      useSecureCookies: false,
      defaultCookieAttributes: cookieOptions(config),
    },
    plugins: [inertPlugin],
  });
}

export type Auth = ReturnType<typeof buildAuth>;

/** Null without a secret: sessions then resolve through the legacy cookie only. */
export function createAuth(deps: AuthDeps): Auth | null {
  const secret = deps.config.auth.secret;
  if (!secret) {
    deps.logger.warn(
      'AUTH_SECRET and COOKIE_SECRET are unset; better-auth is off and only legacy sessions resolve'
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
