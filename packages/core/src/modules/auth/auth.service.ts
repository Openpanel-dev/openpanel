// Moved from @openpanel/auth (M4-007): token issuance/hashing, argon2
// password hashing, TOTP, the OAuth clients and cookie helpers. The
// Prisma-touching half — creating, validating and invalidating a `sessions`
// row — moved here too (M8-005, `./src/login-session.ts`), lazily loading
// @openpanel/db's Prisma client the same way `loadRegistration` below does,
// so there is no static core -> db edge.

import { z } from 'zod';
import type { ServiceDeps } from '../../services';
import type { ISetCookie } from '../../shared/cookie';
import {
  deleteSessionTokenCookie,
  setLastAuthProviderCookie,
  setSessionTokenCookie,
} from './src/cookie';
import { parseCookieDomain } from './src/cookie-domain';
import { Arctic, github, google } from './src/oauth';
import { hashPassword, verifyPasswordHash } from './src/password';
import {
  decodeSessionToken,
  generateSessionToken,
  hashSessionToken,
} from './src/token';
import {
  buildOtpauthUrl,
  consumeRecoveryCode,
  generateQrDataUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCodes,
  normalizeRecoveryCode,
  verifyTotpCode,
} from './src/totp';

// Re-exported straight from source (not through the imports above, which
// exist for `createAuthService` below) — `noExportedImports` would otherwise
// flag every one of those imports as "only re-exported", which is false;
// they are also this file's `AuthService` container.
export { COOKIE_MAX_AGE, COOKIE_OPTIONS } from './src/constants';
export {
  deleteSessionTokenCookie,
  setLastAuthProviderCookie,
  setSessionTokenCookie,
} from './src/cookie';
export { parseCookieDomain } from './src/cookie-domain';
export type { OAuth2Tokens } from './src/oauth';
export { Arctic, github, google, googleGsc } from './src/oauth';
export { hashPassword, verifyPasswordHash } from './src/password';
export {
  decodeSessionToken,
  generateSessionToken,
  hashSessionToken,
} from './src/token';
export {
  buildOtpauthUrl,
  consumeRecoveryCode,
  generateQrDataUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCodes,
  normalizeRecoveryCode,
  verifyTotpCode,
} from './src/totp';

export interface AuthService {
  hashPassword(password: string): Promise<string>;
  verifyPasswordHash(hash: string, password: string): Promise<boolean>;
  generateSessionToken(): string;
  decodeSessionToken(token: string): string | null;
  hashSessionToken(token: string): string;
  generateTotpSecret(): string;
  buildOtpauthUrl(args: { secret: string; accountName: string }): string;
  generateQrDataUrl(otpauthUrl: string): Promise<string>;
  verifyTotpCode(secret: string, code: string): boolean;
  generateRecoveryCodes(count?: number): string[];
  hashRecoveryCodes(codes: string[]): Promise<string[]>;
  normalizeRecoveryCode(input: string): string;
  consumeRecoveryCode(args: {
    hashes: string[];
    input: string;
  }): Promise<{ valid: boolean; remaining: string[] }>;
  setSessionTokenCookie(
    setCookie: ISetCookie,
    token: string,
    expiresAt: Date
  ): void;
  setLastAuthProviderCookie(setCookie: ISetCookie, provider: string): void;
  deleteSessionTokenCookie(setCookie: ISetCookie): void;
  parseCookieDomain(url: string): {
    domain: string | undefined;
    secure: boolean;
  };
}

/**
 * Registered in `services.ts`. `deps` is unused today (every function here is
 * pure or reads its own env) — kept on the signature because every other
 * module's factory takes it, and a method that later needs `logger` should
 * not change the call site.
 */
export function createAuthService(_deps: ServiceDeps): AuthService {
  return {
    hashPassword,
    verifyPasswordHash,
    generateSessionToken,
    decodeSessionToken,
    hashSessionToken,
    generateTotpSecret,
    buildOtpauthUrl,
    generateQrDataUrl,
    verifyTotpCode,
    generateRecoveryCodes,
    hashRecoveryCodes,
    normalizeRecoveryCode,
    consumeRecoveryCode,
    setSessionTokenCookie,
    setLastAuthProviderCookie,
    deleteSessionTokenCookie,
    parseCookieDomain,
  };
}

// -----------------------------------------------------------------------
// The Prisma-touching half (M6-003): sign-up/sign-in, TOTP challenges,
// password reset, share unlock and the github/google OAuth callback. This
// is the logic packages/trpc/src/routers/auth.ts and
// apps/api/src/controllers/oauth-callback.controller.tsx held inline —
// neither ever had a `packages/db/src/services/*` home to move from, unlike
// every other M5/M6 module, so it is written directly here (DELEGATE
// PATTERN: both V1's trpc router and this package's own auth.rpc.ts call
// these same functions).
//
// db/session/registration/share access is LAZY, not a static top-level
// import — see user.service.ts's header for the full reasoning (constructing
// @openpanel/db's clients at import time spawns a pino-pretty transport
// worker thread per `bun test --isolate` file). `loadShare` points at
// `../share/share.service` directly since M6-004 — share.service.ts
// statically imports this file's own `hashPassword`, so the two are mutually
// lazy/eager by design, not a live cycle.
//
// None of these functions take a `TrpcContext`/`Ctx`: they take exactly the
// primitives they touch (`setCookie`, `cookies.get`, `logger`), so this file
// has no dependency on the rpc layer that calls it.

import { sendEmail } from '../../clients/email';
import type { Logger } from '../../logger';
import { TRPCAccessError, TRPCNotFoundError } from '../../rpc/errors';
import { decrypt, encrypt } from '../../shared/encryption';
import { generateSecureId } from '../../shared/id';
import { connectUserToOrganization } from '../organization/organization.service';
import { getUserAccount } from '../user/user.service';

const TWO_FACTOR_COOKIE = '2fa_challenge';
const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 5 * 60;
const INVITE_COOKIE = 'inviteId';
// V1's reset-password token: 10 minutes.
const RESET_PASSWORD_TTL_MS = 1000 * 60 * 10;

export type AuthProvider = 'email' | 'google' | 'github';

/** `HttpCtx.cookies`'s shape (`shared/cookie.ts`'s `CookieJar`), named locally
 *  so this file has no import from the rpc/http layer that calls it. */
interface CookieReader {
  get(name: string): string | undefined;
}

function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

function loadAuthSession() {
  return import('./src/login-session');
}

function loadRegistration() {
  return import('@openpanel/core');
}

function loadShare() {
  return import('../share/share.service');
}

function dashboardUrl(): string {
  return (
    process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL || ''
  );
}

/**
 * Best-effort consumption of an invite for a user that just authenticated.
 * Failures (expired/invalid invite) must not block the sign-in itself, so we
 * swallow and log the error instead of rethrowing.
 */
async function consumeInviteForUser(
  userId: string,
  inviteId: string,
  logger: Pick<Logger, 'error'>
): Promise<void> {
  try {
    const db = await loadDb();
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await connectUserToOrganization({ user, inviteId });
  } catch (error) {
    logger.error(
      { userId, inviteId, error },
      'Failed to connect user to organization via invite'
    );
  }
}

export async function signOutUser(
  setCookie: ISetCookie,
  sessionId: string | null | undefined
): Promise<void> {
  deleteSessionTokenCookie(setCookie);
  if (sessionId) {
    const { invalidateSession } = await loadAuthSession();
    await invalidateSession(sessionId);
  }
}

export interface StartOAuthSignInInput {
  provider: AuthProvider;
  inviteId?: string | null;
}

export type StartOAuthSignInResult =
  | { type: 'github'; url: string }
  | { type: 'google'; url: string };

/**
 * No registration check here. At this point we have no identity for the
 * caller — the IdP hasn't been hit yet — so we cannot tell a returning user
 * from a new sign-up. Gating here locks out every existing OAuth user as soon
 * as their session expires. The check lives in `completeOAuthCallback`, the
 * only place we know the user is new.
 */
export function startOAuthSignIn(
  input: StartOAuthSignInInput,
  setCookie: ISetCookie
): StartOAuthSignInResult {
  if (input.inviteId) {
    setCookie('inviteId', input.inviteId, { maxAge: 60 * 10 });
  }

  if (input.provider === 'github') {
    const state = Arctic.generateState();
    const url = github.createAuthorizationURL(state, [
      'user:email',
      'user:read',
    ]);
    setCookie('github_oauth_state', state, { maxAge: 60 * 10 });
    return { type: 'github', url: url.toString() };
  }

  const state = Arctic.generateState();
  const codeVerifier = Arctic.generateCodeVerifier();
  const url = google.createAuthorizationURL(state, codeVerifier, [
    'openid',
    'profile',
    'email',
  ]);
  setCookie('google_oauth_state', state, { maxAge: 60 * 10 });
  setCookie('google_code_verifier', codeVerifier, { maxAge: 60 * 10 });
  return { type: 'google', url: url.toString() };
}

export interface SignUpEmailInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  inviteId?: string | null;
}

export async function signUpWithEmail(
  input: SignUpEmailInput,
  setCookie: ISetCookie
) {
  const { getIsRegistrationAllowed } = await loadRegistration();
  const isRegistrationAllowed = await getIsRegistrationAllowed(input.inviteId);
  if (!isRegistrationAllowed) {
    throw new TRPCAccessError('Registrations are not allowed');
  }

  const provider = 'email';
  const db = await loadDb();
  const existing = await getUserAccount({ email: input.email, provider });
  if (existing) {
    throw new TRPCNotFoundError('User already exists');
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

  const { createSession } = await loadAuthSession();
  const token = generateSessionToken();
  const session = await createSession(token, createdUser.id);
  setSessionTokenCookie(setCookie, token, session.expiresAt);
  return session;
}

export interface SignInEmailInput {
  email: string;
  password: string;
  inviteId?: string | null;
}

export type SignInEmailResult = { type: 'totp_required' } | { type: 'email' };

export async function signInWithEmail(
  input: SignInEmailInput,
  setCookie: ISetCookie,
  logger: Pick<Logger, 'error'>
): Promise<SignInEmailResult> {
  const password = input.password.trim();
  const user = await getUserAccount({ email: input.email, provider: 'email' });

  if (!user) {
    throw new TRPCNotFoundError('User does not exists');
  }

  // If the password starts with $argon2 we use the new password hashing,
  // otherwise it's legacy from Clerk which used bcrypt (ADR-011: no legacy
  // branch — those rows are nulled, so this is now just a generic reject).
  if (!user.account.password?.startsWith('$argon2')) {
    throw new TRPCAccessError('Reset your password, old password has expired');
  }

  const validPassword = await verifyPasswordHash(
    user.account.password,
    password
  );
  if (!validPassword) {
    throw new TRPCAccessError('Incorrect email or password');
  }

  const db = await loadDb();
  const totp = await db.userTotp.findUnique({ where: { userId: user.id } });
  if (totp?.enabledAt) {
    const challengeId = generateSecureId('2fa');
    await db.twoFactorChallenge.create({
      data: {
        id: challengeId,
        userId: user.id,
        expiresAt: new Date(
          Date.now() + TWO_FACTOR_CHALLENGE_TTL_SECONDS * 1000
        ),
      },
    });
    setCookie(TWO_FACTOR_COOKIE, challengeId, {
      maxAge: TWO_FACTOR_CHALLENGE_TTL_SECONDS,
    });
    // Carry the invite through the 2FA challenge so it can be consumed once
    // the user completes the second factor in `signInWithTotp`.
    if (input.inviteId) {
      setCookie(INVITE_COOKIE, input.inviteId, {
        maxAge: TWO_FACTOR_CHALLENGE_TTL_SECONDS,
      });
    }
    return { type: 'totp_required' };
  }

  const { createSession } = await loadAuthSession();
  const token = generateSessionToken();
  const session = await createSession(token, user.id);
  setSessionTokenCookie(setCookie, token, session.expiresAt);
  setLastAuthProviderCookie(setCookie, 'email');

  if (input.inviteId) {
    await consumeInviteForUser(user.id, input.inviteId, logger);
  }

  return { type: 'email' };
}

export interface SignInTotpInput {
  code: string;
}

export async function signInWithTotp(
  input: SignInTotpInput,
  cookies: CookieReader,
  setCookie: ISetCookie,
  logger: Pick<Logger, 'error'>
): Promise<{ type: 'email' }> {
  const challengeId = cookies.get(TWO_FACTOR_COOKIE);
  if (!challengeId) {
    throw new TRPCAccessError('No active two-factor challenge');
  }

  const db = await loadDb();
  const challenge = await db.twoFactorChallenge.findUnique({
    where: { id: challengeId },
  });

  if (!challenge || challenge.expiresAt < new Date()) {
    if (challenge) {
      await db.twoFactorChallenge.delete({ where: { id: challenge.id } });
    }
    setCookie(TWO_FACTOR_COOKIE, '', { maxAge: 0 });
    throw new TRPCAccessError('Two-factor challenge has expired');
  }

  const totp = await db.userTotp.findUnique({
    where: { userId: challenge.userId },
  });
  if (!totp?.enabledAt) {
    await db.twoFactorChallenge.delete({ where: { id: challenge.id } });
    setCookie(TWO_FACTOR_COOKIE, '', { maxAge: 0 });
    throw new TRPCAccessError('Two-factor is not enabled');
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
    throw new TRPCAccessError('Invalid code');
  }

  await db.twoFactorChallenge.delete({ where: { id: challenge.id } });
  setCookie(TWO_FACTOR_COOKIE, '', { maxAge: 0 });

  const { createSession } = await loadAuthSession();
  const token = generateSessionToken();
  const session = await createSession(token, challenge.userId);
  setSessionTokenCookie(setCookie, token, session.expiresAt);
  setLastAuthProviderCookie(setCookie, 'email');

  const inviteId = cookies.get(INVITE_COOKIE);
  if (inviteId) {
    await consumeInviteForUser(challenge.userId, inviteId, logger);
    setCookie(INVITE_COOKIE, '', { maxAge: 0 });
  }

  return { type: 'email' };
}

export async function getTotpStatus(userId: string) {
  const db = await loadDb();
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
}

export async function setupTotp(userId: string) {
  const db = await loadDb();
  const emailAccount = await db.account.findFirst({
    where: { userId, provider: 'email' },
    select: { id: true },
  });
  if (!emailAccount) {
    throw new TRPCAccessError(
      'Two-factor authentication is only available for email/password sign-ins. Your account uses a social provider, which handles 2FA on its end.'
    );
  }
  const existing = await db.userTotp.findUnique({ where: { userId } });
  if (existing?.enabledAt) {
    throw new TRPCAccessError(
      'Two-factor is already enabled. Disable it first to re-configure.'
    );
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  });

  const secret = generateTotpSecret();
  const otpauthUrl = buildOtpauthUrl({ secret, accountName: user.email });
  const qrDataUrl = await generateQrDataUrl(otpauthUrl);

  await db.userTotp.upsert({
    where: { userId },
    create: { userId, secret: encrypt(secret), recoveryCodes: [] },
    update: { secret: encrypt(secret), recoveryCodes: [], enabledAt: null },
  });

  return { otpauthUrl, qrDataUrl, secret };
}

export async function enableTotp(userId: string, code: string) {
  const db = await loadDb();
  const totp = await db.userTotp.findUnique({ where: { userId } });
  if (!totp) {
    throw new TRPCNotFoundError('Start two-factor setup first');
  }
  if (totp.enabledAt) {
    throw new TRPCAccessError('Two-factor is already enabled');
  }

  const secret = decrypt(totp.secret);
  if (!verifyTotpCode(secret, code)) {
    throw new TRPCAccessError('Invalid code');
  }

  const recoveryCodes = generateRecoveryCodes();
  const hashed = await hashRecoveryCodes(recoveryCodes);

  await db.userTotp.update({
    where: { userId },
    data: { enabledAt: new Date(), recoveryCodes: hashed },
  });

  return { recoveryCodes };
}

export async function disableTotp(userId: string, code: string) {
  const db = await loadDb();
  const totp = await db.userTotp.findUnique({ where: { userId } });
  if (!totp?.enabledAt) {
    throw new TRPCAccessError('Two-factor is not enabled');
  }

  const secret = decrypt(totp.secret);
  const isTotpCode = /^\d{6}$/.test(code.replace(/\s+/g, ''));
  const valid = isTotpCode
    ? verifyTotpCode(secret, code)
    : (await consumeRecoveryCode({ hashes: totp.recoveryCodes, input: code }))
        .valid;

  if (!valid) {
    throw new TRPCAccessError('Invalid code');
  }

  await db.userTotp.delete({ where: { userId } });
  await db.twoFactorChallenge.deleteMany({ where: { userId } });
  return { disabled: true };
}

export async function regenerateTotpRecoveryCodes(
  userId: string,
  code: string
) {
  const db = await loadDb();
  const totp = await db.userTotp.findUnique({ where: { userId } });
  if (!totp?.enabledAt) {
    throw new TRPCAccessError('Two-factor is not enabled');
  }
  const secret = decrypt(totp.secret);
  if (!verifyTotpCode(secret, code)) {
    throw new TRPCAccessError('Invalid code');
  }
  const recoveryCodes = generateRecoveryCodes();
  const hashed = await hashRecoveryCodes(recoveryCodes);
  await db.userTotp.update({
    where: { userId },
    data: { recoveryCodes: hashed },
  });
  return { recoveryCodes };
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

export async function resetPasswordWithToken(
  input: ResetPasswordInput
): Promise<true> {
  const db = await loadDb();
  const resetPassword = await db.resetPassword.findUnique({
    where: { id: input.token },
  });

  if (!resetPassword) {
    throw new TRPCNotFoundError('Reset password not found');
  }
  if (resetPassword.expiresAt < new Date()) {
    throw new TRPCNotFoundError('Reset password expired');
  }

  await db.account.update({
    where: { id: resetPassword.accountId },
    data: { password: await hashPassword(input.password) },
  });
  await db.resetPassword.delete({ where: { id: input.token } });

  return true;
}

export async function requestPasswordReset(input: {
  email: string;
}): Promise<true> {
  const user = await getUserAccount({ email: input.email, provider: 'email' });
  // Deliberately not found-vs-found: V1 always returns `true` here so the
  // endpoint cannot be used to enumerate registered emails.
  if (!user?.account.id) {
    return true;
  }

  const db = await loadDb();
  await db.resetPassword.deleteMany({ where: { accountId: user.account.id } });

  const token = generateSecureId('pw');
  const expiresAt = new Date(Date.now() + RESET_PASSWORD_TTL_MS);
  await db.resetPassword.create({
    data: { id: token, expiresAt, accountId: user.account.id },
  });

  await sendEmail('reset-password', {
    to: input.email,
    data: { url: `${dashboardUrl()}/reset-password?token=${token}` },
  });

  return true;
}

export async function extendSessionCookie(
  cookies: CookieReader,
  hasSession: boolean,
  setCookie: ISetCookie
): Promise<{ extended: boolean; expiresAt?: Date }> {
  const token = cookies.get('session');
  if (!(hasSession && token)) {
    return { extended: false };
  }

  const { validateSessionToken } = await loadAuthSession();
  const session = await validateSessionToken(token);

  if (session.session) {
    setSessionTokenCookie(setCookie, token, session.session.expiresAt);
    return { extended: true, expiresAt: session.session.expiresAt };
  }

  return { extended: false };
}

export interface SignInShareInput {
  password: string;
  shareId: string;
  shareType?: 'overview' | 'dashboard' | 'report';
}

export async function signInToShare(
  input: SignInShareInput,
  setCookie: ISetCookie
): Promise<true> {
  const { password, shareId, shareType = 'overview' } = input;
  const { getShareOverviewById, getShareDashboardById, getShareReportById } =
    await loadShare();

  let share: { password: string | null; public: boolean } | null = null;
  let cookieName = '';

  if (shareType === 'overview') {
    share = await getShareOverviewById(shareId);
    cookieName = `shared-overview-${shareId}`;
  } else if (shareType === 'dashboard') {
    share = await getShareDashboardById(shareId);
    cookieName = `shared-dashboard-${shareId}`;
  } else if (shareType === 'report') {
    share = await getShareReportById(shareId);
    cookieName = `shared-report-${shareId}`;
  }

  if (!share) {
    throw new TRPCNotFoundError('Share not found');
  }
  if (!share.public) {
    throw new TRPCNotFoundError('Share is not public');
  }
  if (!share.password) {
    throw new TRPCNotFoundError('Share is not password protected');
  }

  const validPassword = await verifyPasswordHash(share.password, password);
  if (!validPassword) {
    throw new TRPCAccessError('Incorrect password');
  }

  setCookie(cookieName, '1', { maxAge: 60 * 60 * 24 * 7 });
  return true;
}

// -----------------------------------------------------------------------
// The github/google OAuth callback (apps/api's /oauth/{github,google}/callback
// — DELEGATE PATTERN, same shape as gsc.service.ts#completeGscOAuthCallback).
// State/query parsing and cookie reads stay in each transport (Fastify's
// controller, this package's own auth.routes.ts): only the token exchange,
// user lookup/creation and session issuance live here.

export interface OAuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName?: string;
}

/** Raised for every *expected* failure — the caller shows `.message` verbatim
 *  in the `/login?error=` redirect, same as V1's `LogError`. Anything else
 *  thrown is an unexpected bug and the caller shows a generic message. */
export class OAuthCallbackError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'OAuthCallbackError';
  }
}

async function fetchGithubEmail(accessToken: string): Promise<string | null> {
  const emailListRequest = new Request('https://api.github.com/user/emails');
  emailListRequest.headers.set('Authorization', `Bearer ${accessToken}`);
  const emailListResponse = await fetch(emailListRequest);
  const emailListResult: unknown = await emailListResponse.json();
  if (!Array.isArray(emailListResult) || emailListResult.length < 1) {
    return null;
  }
  let email: string | null = null;
  for (const emailRecord of emailListResult) {
    const emailParser = z.object({
      primary: z.boolean(),
      verified: z.boolean(),
      email: z.string(),
    });
    const emailResult = emailParser.safeParse(emailRecord);
    if (!emailResult.success) {
      continue;
    }
    if (emailResult.data.primary && emailResult.data.verified) {
      email = emailResult.data.email;
    }
  }
  return email;
}

export async function fetchGithubOAuthUser(code: string): Promise<OAuthUser> {
  const tokens = await github.validateAuthorizationCode(code);
  const accessToken = tokens.accessToken();
  const email = await fetchGithubEmail(accessToken);
  if (!email) {
    throw new OAuthCallbackError('GitHub email not found or not verified');
  }

  const userRequest = new Request('https://api.github.com/user');
  userRequest.headers.set('Authorization', `Bearer ${accessToken}`);
  const userResponse = await fetch(userRequest);

  const userSchema = z.object({
    id: z.number(),
    login: z.string(),
    name: z
      .string()
      .nullish()
      .transform((val) => val || ''),
  });
  const userJson = await userResponse.json();
  const userResult = userSchema.safeParse(userJson);
  if (!userResult.success) {
    throw new OAuthCallbackError('Error fetching Github user', {
      error: userResult.error,
      githubUser: userJson,
    });
  }

  return {
    id: String(userResult.data.id),
    email,
    firstName: userResult.data.name || userResult.data.login || '',
  };
}

export async function fetchGoogleOAuthUser(
  code: string,
  codeVerifier: string
): Promise<OAuthUser> {
  const tokens = await google.validateAuthorizationCode(code, codeVerifier);
  const claims = Arctic.decodeIdToken(tokens.idToken());

  const claimsSchema = z.object({
    sub: z.string(),
    email: z.string(),
    email_verified: z.boolean(),
    given_name: z.string().optional(),
    family_name: z.string().optional(),
  });
  const claimsResult = claimsSchema.safeParse(claims);
  if (!claimsResult.success) {
    throw new OAuthCallbackError('Error fetching Google user', {
      error: claimsResult.error,
      claims,
    });
  }
  if (!claimsResult.data.email_verified) {
    throw new OAuthCallbackError('Email not verified with Google');
  }

  return {
    id: claimsResult.data.sub,
    email: claimsResult.data.email,
    firstName: claimsResult.data.given_name || '',
    lastName: claimsResult.data.family_name || '',
  };
}

/**
 * Checked by the caller BEFORE exchanging `code` for tokens — same ordering
 * as V1's `validateOAuthCallback`, so a forged `state` never costs an IdP
 * round-trip.
 */
export function assertOAuthState(
  provider: 'github' | 'google',
  state: string,
  storedState: string | null
): void {
  if (!storedState || state !== storedState) {
    throw new OAuthCallbackError('OAuth state mismatch', {
      provider,
      hasStoredState: Boolean(storedState),
    });
  }
}

export interface CompleteOAuthCallbackInput {
  provider: 'github' | 'google';
  oauthUser: OAuthUser;
  inviteId: string | null | undefined;
  setCookie: ISetCookie;
  logger: Pick<Logger, 'error'>;
}

/**
 * State/token-exchange validation stays with the caller (`assertOAuthState`,
 * then the provider-specific `fetch*OAuthUser`); this is the shared half —
 * find-or-create the account and issue a session.
 */
export async function completeOAuthCallback(
  input: CompleteOAuthCallbackInput
): Promise<void> {
  const { provider, oauthUser, inviteId, setCookie, logger } = input;
  const db = await loadDb();

  const account = await db.account.findFirst({
    where: {
      OR: [
        { provider, providerId: oauthUser.id },
        // During migration
        { provider, providerId: null, email: oauthUser.email },
        { provider: 'oauth', user: { email: oauthUser.email } },
      ],
    },
  });

  if (account) {
    await completeExistingOAuthUser({
      account,
      oauthUser,
      provider,
      inviteId,
      setCookie,
      logger,
    });
    return;
  }

  await completeNewOAuthUser({
    oauthUser,
    provider,
    inviteId,
    setCookie,
    logger,
  });
}

async function completeExistingOAuthUser({
  account,
  oauthUser,
  provider,
  inviteId,
  setCookie,
  logger,
}: {
  account: { id: string; userId: string };
  oauthUser: OAuthUser;
  provider: 'github' | 'google';
  inviteId: string | null | undefined;
  setCookie: ISetCookie;
  logger: Pick<Logger, 'error'>;
}) {
  const db = await loadDb();
  const { createSession } = await loadAuthSession();
  const sessionToken = generateSessionToken();
  const session = await createSession(sessionToken, account.userId);

  await db.account.update({
    where: { id: account.id },
    data: { provider, providerId: oauthUser.id, email: oauthUser.email },
  });

  if (inviteId) {
    await consumeInviteForUser(account.userId, inviteId, logger);
  }

  setSessionTokenCookie(setCookie, sessionToken, session.expiresAt);
  setLastAuthProviderCookie(setCookie, provider);
}

async function completeNewOAuthUser({
  oauthUser,
  provider,
  inviteId,
  setCookie,
  logger,
}: {
  oauthUser: OAuthUser;
  provider: 'github' | 'google';
  inviteId: string | null | undefined;
  setCookie: ISetCookie;
  logger: Pick<Logger, 'error'>;
}) {
  const db = await loadDb();
  const { getIsRegistrationAllowed } = await loadRegistration();

  const existingUser = await db.user.findFirst({
    where: { email: oauthUser.email },
  });
  if (existingUser) {
    throw new OAuthCallbackError(
      'Please sign in using your original authentication method',
      { existingUser, oauthUser, provider }
    );
  }

  // Enforce the self-hosting registration policy here rather than before the
  // IdP redirect — this is the first point where we know the user is new, so
  // returning users are never caught by it.
  if (!(await getIsRegistrationAllowed(inviteId))) {
    // Deliberately no `oauthUser` here — this rejects people who are not
    // users, so their email and name shouldn't land in application logs.
    throw new OAuthCallbackError('Registrations are not allowed', {
      provider,
      inviteId,
    });
  }

  const user = await db.user.create({
    data: {
      email: oauthUser.email,
      firstName: oauthUser.firstName,
      lastName: oauthUser.lastName,
      accounts: {
        create: { provider, providerId: oauthUser.id },
      },
    },
  });

  if (inviteId) {
    try {
      await connectUserToOrganization({ user, inviteId });
    } catch (error) {
      logger.error(
        { error, inviteId, user },
        'error connecting user to organization'
      );
    }
  }

  const { createSession } = await loadAuthSession();
  const sessionToken = generateSessionToken();
  const session = await createSession(sessionToken, user.id);
  setSessionTokenCookie(setCookie, sessionToken, session.expiresAt);
  setLastAuthProviderCookie(setCookie, provider);
}
