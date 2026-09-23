// Moved from @openpanel/auth (M4-007): token issuance/hashing, argon2
// password hashing, TOTP, the OAuth clients and cookie helpers. The
// Prisma-touching half — creating, validating and invalidating a `sessions`
// row — moved here too (M8-005, `./src/login-session.ts`).
//
// M10-002 (docs/TECH_DEBT.md §5b): the permission ladder (`modules/auth/src/access.ts`)
// is bound to its real lookups exactly here, once, instead of once per module
// in a `modules/*/src/access.ts` copy — see `getAccessChecks` below for the
// binding itself.
//
// M10-004: every module in this wave, INCLUDING auth's own remaining lazy
// imports, moves to `ServiceDeps`. `signUpWithEmail`/`signInWithEmail`/TOTP/
// password-reset/OAuth-callback all take `deps` now and reach Postgres as
// `deps.db`; `./src/login-session.ts` and `./src/registration.ts` do the
// same and are plain static imports here (neither cycles back to this file).
// `auth.rpc.ts` already carries a `Ctx` and passes it straight through.

import { z } from 'zod';
import type { CoreConfig } from '../../config';
import type { ServiceDeps, Services } from '../../services';
// Aliased: three members of `createAuthService` below carry the same names,
// and this file is the ONE place the ladder is bound to these lookups.
import {
  canWriteProject,
  getClientAccess as getClientAccessLookup,
  getOrganizationAccess as getOrganizationAccessLookup,
  getProjectAccess as getProjectAccessLookup,
  getProjectById,
  type IProjectAccess,
} from '../../shared/access-lookups';
import type { ISetCookie } from '../../shared/cookie';
import { type AccessChecks, createAccessChecks } from './src/access';
import {
  deleteSessionTokenCookie,
  setLastAuthProviderCookie,
  setSessionTokenCookie,
} from './src/cookie';
import { parseCookieDomain } from './src/cookie-domain';
import { Arctic, githubClient, googleClient } from './src/oauth';
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
// they are also the members `createAuthService` returns.
export { COOKIE_MAX_AGE, cookieOptions } from './src/constants';
export {
  deleteSessionTokenCookie,
  setLastAuthProviderCookie,
  setSessionTokenCookie,
} from './src/cookie';
export { parseCookieDomain } from './src/cookie-domain';
export type { OAuth2Tokens } from './src/oauth';
export {
  Arctic,
  githubClient,
  googleClient,
  googleGscClient,
} from './src/oauth';
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

/** The ladder contract this module binds and `createAuthService` satisfies. */
type ProjectAccessChecks = AccessChecks<IProjectAccess>;

let accessChecksPromise: Promise<ProjectAccessChecks> | undefined;

/**
 * The single binding of the ladder to real lookups
 * (M10-002, docs/TECH_DEBT.md §5b) — memoized: `createAccessChecks` runs
 * exactly once per process, on however many requests, no matter how many of
 * this function's callers invoke it. Nothing runs at module-import time or at
 * `createAuthService` construction time; the binding is built on the first
 * actual check. An earlier attempt bound it at module scope and hung
 * `bun test` for 30 minutes.
 *
 * Still a `Promise` because the contract is awaited at every call site and
 * was what each module's own access file used to resolve lazily.
 *
 * `integration.service.ts` and `subscription.service.ts` import this
 * directly instead of going through `ctx.services.auth`: both are called with
 * a bare `userId` and no `ctx`. Operator-authorized (docs/TECH_DEBT.md §5b).
 */
export function getAccessChecks(): Promise<ProjectAccessChecks> {
  if (!accessChecksPromise) {
    accessChecksPromise = Promise.resolve(
      createAccessChecks({
        getProjectAccess: getProjectAccessLookup,
        canWriteProject,
        getOrganizationAccess: getOrganizationAccessLookup,
        getProjectById,
      })
    );
  }
  return accessChecksPromise;
}

/**
 * Test-only escape hatch. `accessChecksPromise` is a true process-lifetime
 * singleton by design (see `getAccessChecks` above), so a test that mocks
 * `access-lookups`/`project.service` to prove the injection seam works must
 * clear it afterward — otherwise, under a bare (non-`--isolate`) `bun test`,
 * the fake closures it built would answer every later file's real access
 * checks too.
 */
export function resetAccessChecksForTests(): void {
  accessChecksPromise = undefined;
}

/**
 * The one login check in the tree (ADR-022 R10).
 *
 * `protectedProcedure` already refuses an anonymous caller and hands the
 * handler a `session.userId` that is a `string`, so a protected procedure
 * needs nothing here. This is for the paths the builder cannot decide: the
 * share-aware `chartProcedure` / `overviewProcedure`, which are public
 * because a valid share link is an alternative to being signed in, and only
 * demand a user when no share was presented. Until M15-007 it was copied,
 * unexported, into 28 `*.rpc.ts` files.
 */
export function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

/**
 * Registered in `services.ts`. Ignores BOTH arguments, and takes them only
 * because ADR-022 R3 keeps the composition root a flat list: every member
 * here is either pure, reads its own env, or — for the access checks —
 * reaches the shared, memoized `getAccessChecks()` above, whose lookups are
 * `cacheable` (their key is derived from the call's arguments, so they cannot
 * take a leading `deps`; see shared/access-lookups.ts). A member that later
 * needs `db` / `logger` drops the underscore and reads the parameter.
 */
export function createAuthService(
  deps: ServiceDeps,
  _services: () => Services
) {
  // One function per member, closing over `deps`, so the return statement
  // below stays a plain index (ADR-022 R4) — nothing here is a `return { ... }`
  // literal with logic inside it.
  async function requireProjectAccess(
    args: Parameters<ProjectAccessChecks['requireProjectAccess']>[0]
  ): ReturnType<ProjectAccessChecks['requireProjectAccess']> {
    return (await getAccessChecks()).requireProjectAccess(args);
  }

  async function requireOrganizationAdmin(
    args: Parameters<ProjectAccessChecks['requireOrganizationAdmin']>[0]
  ): ReturnType<ProjectAccessChecks['requireOrganizationAdmin']> {
    return (await getAccessChecks()).requireOrganizationAdmin(args);
  }

  async function requireProjectAdmin(
    args: Parameters<ProjectAccessChecks['requireProjectAdmin']>[0]
  ): ReturnType<ProjectAccessChecks['requireProjectAdmin']> {
    return (await getAccessChecks()).requireProjectAdmin(args);
  }

  function getProjectAccess(args: {
    userId: string;
    projectId: string;
  }): Promise<IProjectAccess | null> {
    return getProjectAccessLookup(args);
  }

  function getOrganizationAccess(
    ...args: Parameters<typeof getOrganizationAccessLookup>
  ): ReturnType<typeof getOrganizationAccessLookup> {
    return getOrganizationAccessLookup(...args);
  }

  function getClientAccess(
    ...args: Parameters<typeof getClientAccessLookup>
  ): ReturnType<typeof getClientAccessLookup> {
    return getClientAccessLookup(...args);
  }

  /**
   * The session cookie's other half. `http/session.ts` reaches it here
   * rather than deep-importing `./src/login-session` (ADR-022 R22), which
   * is also what keeps the demo-user branch inside one function.
   */
  function checkSessionToken(
    token: string | null | undefined
  ): Promise<SessionValidationResult> {
    return validateSessionToken(deps, token);
  }

  function setSessionCookie(
    setCookie: ISetCookie,
    token: string,
    expiresAt: Date
  ): void {
    setSessionTokenCookie(deps.config, setCookie, token, expiresAt);
  }

  function setAuthProviderCookie(
    setCookie: ISetCookie,
    provider: string
  ): void {
    setLastAuthProviderCookie(deps.config, setCookie, provider);
  }

  function clearSessionCookie(setCookie: ISetCookie): void {
    deleteSessionTokenCookie(deps.config, setCookie);
  }

  function cookieDomainForUrl(
    url: string
  ): ReturnType<typeof parseCookieDomain> {
    return parseCookieDomain(deps.config, url);
  }

  return {
    requireProjectAccess,
    requireOrganizationAdmin,
    requireProjectAdmin,
    requireLogin,
    validateSessionToken: checkSessionToken,
    getProjectAccess,
    getOrganizationAccess,
    getClientAccess,
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
    setSessionTokenCookie: setSessionCookie,
    setLastAuthProviderCookie: setAuthProviderCookie,
    deleteSessionTokenCookie: clearSessionCookie,
    parseCookieDomain: cookieDomainForUrl,
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
// Session/registration access is `deps.db`, via static imports of
// `./src/login-session` and `./src/registration` (M10-004) — neither cycles
// back to this file, so there is nothing to keep lazy there. Share is the one
// real cycle (M6-004) — share.service.ts statically imports this file's own
// `hashPassword` — so `signInToShare` reaches it through the composition
// root's `services()` thunk instead of importing it at all.
//
// None of these functions take a `TrpcContext`/`Ctx` directly — they take a
// `deps: ServiceDeps` plus exactly the other primitives they touch
// (`setCookie`, `cookies.get`, `logger`), so this file has no dependency on
// the rpc layer that calls it.

import { generateSecureId } from '@openpanel/shared';
import { decrypt, encrypt } from '@openpanel/shared/server';
import { sendEmail } from '../../clients/email';
import type { Logger } from '../../logger';
import {
  TRPCAccessError,
  TRPCForbiddenError,
  TRPCNotFoundError,
} from '../../rpc/errors';
import {
  createShareAccessToken,
  shareAccessCookieName,
} from '../../shared/share-access';
import { connectUserToOrganization } from '../organization/organization.service';
import { getUserAccount } from '../user/user.service';
import {
  createSession,
  invalidateSession,
  type SessionValidationResult,
  validateSessionToken,
} from './src/login-session';
import { getIsRegistrationAllowed } from './src/registration';

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

/**
 * Best-effort consumption of an invite for a user that just authenticated.
 * Failures (expired/invalid invite) must not block the sign-in itself, so we
 * swallow and log the error instead of rethrowing.
 */
async function consumeInviteForUser(
  deps: ServiceDeps,
  userId: string,
  inviteId: string,
  logger: Pick<Logger, 'error'>
): Promise<void> {
  try {
    const user = await deps.db.user.findUniqueOrThrow({
      where: { id: userId },
    });
    await connectUserToOrganization(deps, { user, inviteId });
  } catch (error) {
    logger.error(
      { userId, inviteId, error },
      'Failed to connect user to organization via invite'
    );
  }
}

export async function signOutUser(
  deps: ServiceDeps,
  setCookie: ISetCookie,
  sessionId: string | null | undefined
): Promise<void> {
  deleteSessionTokenCookie(deps.config, setCookie);
  if (sessionId) {
    await invalidateSession(deps, sessionId);
  }
}

export interface StartOAuthSignInInput {
  provider: AuthProvider;
  inviteId?: string | null;
}

export type StartOAuthSignInResult =
  | { type: 'github'; url: string }
  | { type: 'google'; url: string };

export interface ConfiguredProviders {
  google: boolean;
  github: boolean;
  gsc: boolean;
}

/** A provider counts as configured only when a sign-in could complete: the
 *  client id AND its redirect URI. The secret is never reported. */
export function getConfiguredProviders(
  config: CoreConfig
): ConfiguredProviders {
  const { google, github, googleGsc } = config.auth;
  return {
    google: Boolean(google.clientId && google.redirectUri),
    github: Boolean(github.clientId && github.redirectUri),
    gsc: Boolean(googleGsc.clientId && googleGsc.redirectUri),
  };
}

/**
 * No registration check here. At this point we have no identity for the
 * caller — the IdP hasn't been hit yet — so we cannot tell a returning user
 * from a new sign-up. Gating here locks out every existing OAuth user as soon
 * as their session expires. The check lives in `completeOAuthCallback`, the
 * only place we know the user is new.
 */
export function startOAuthSignIn(
  deps: ServiceDeps,
  input: StartOAuthSignInInput,
  setCookie: ISetCookie
): StartOAuthSignInResult {
  if (input.inviteId) {
    setCookie('inviteId', input.inviteId, { maxAge: 60 * 10 });
  }

  if (input.provider === 'github') {
    const state = Arctic.generateState();
    const url = githubClient(deps.config).createAuthorizationURL(state, [
      'user:email',
      'user:read',
    ]);
    setCookie('github_oauth_state', state, { maxAge: 60 * 10 });
    return { type: 'github', url: url.toString() };
  }

  const state = Arctic.generateState();
  const codeVerifier = Arctic.generateCodeVerifier();
  const url = googleClient(deps.config).createAuthorizationURL(
    state,
    codeVerifier,
    ['openid', 'profile', 'email']
  );
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
  deps: ServiceDeps,
  input: SignUpEmailInput,
  setCookie: ISetCookie
) {
  const isRegistrationAllowed = await getIsRegistrationAllowed(
    deps,
    input.inviteId
  );
  if (!isRegistrationAllowed) {
    throw new TRPCAccessError('Registrations are not allowed');
  }

  const provider = 'email';
  const existing = await getUserAccount(deps, { email: input.email, provider });
  if (existing) {
    throw new TRPCNotFoundError('User already exists');
  }

  const createdUser = await deps.db.user.create({
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
    await connectUserToOrganization(deps, {
      user: createdUser,
      inviteId: input.inviteId,
    });
  }

  const token = generateSessionToken();
  const session = await createSession(deps, token, createdUser.id);
  setSessionTokenCookie(deps.config, setCookie, token, session.expiresAt);
  return session;
}

export interface SignInEmailInput {
  email: string;
  password: string;
  inviteId?: string | null;
}

export type SignInEmailResult = { type: 'totp_required' } | { type: 'email' };

export async function signInWithEmail(
  deps: ServiceDeps,
  input: SignInEmailInput,
  setCookie: ISetCookie,
  logger: Pick<Logger, 'error'>
): Promise<SignInEmailResult> {
  const password = input.password.trim();
  const user = await getUserAccount(deps, {
    email: input.email,
    provider: 'email',
  });

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

  const totp = await deps.db.userTotp.findUnique({
    where: { userId: user.id },
  });
  if (totp?.enabledAt) {
    const challengeId = generateSecureId('2fa');
    await deps.db.twoFactorChallenge.create({
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

  const token = generateSessionToken();
  const session = await createSession(deps, token, user.id);
  setSessionTokenCookie(deps.config, setCookie, token, session.expiresAt);
  setLastAuthProviderCookie(deps.config, setCookie, 'email');

  if (input.inviteId) {
    await consumeInviteForUser(deps, user.id, input.inviteId, logger);
  }

  return { type: 'email' };
}

export interface SignInTotpInput {
  code: string;
}

export async function signInWithTotp(
  deps: ServiceDeps,
  input: SignInTotpInput,
  cookies: CookieReader,
  setCookie: ISetCookie,
  logger: Pick<Logger, 'error'>
): Promise<{ type: 'email' }> {
  const challengeId = cookies.get(TWO_FACTOR_COOKIE);
  if (!challengeId) {
    throw new TRPCAccessError('No active two-factor challenge');
  }

  const challenge = await deps.db.twoFactorChallenge.findUnique({
    where: { id: challengeId },
  });

  if (!challenge || challenge.expiresAt < new Date()) {
    if (challenge) {
      await deps.db.twoFactorChallenge.delete({ where: { id: challenge.id } });
    }
    setCookie(TWO_FACTOR_COOKIE, '', { maxAge: 0 });
    throw new TRPCAccessError('Two-factor challenge has expired');
  }

  const totp = await deps.db.userTotp.findUnique({
    where: { userId: challenge.userId },
  });
  if (!totp?.enabledAt) {
    await deps.db.twoFactorChallenge.delete({ where: { id: challenge.id } });
    setCookie(TWO_FACTOR_COOKIE, '', { maxAge: 0 });
    throw new TRPCAccessError('Two-factor is not enabled');
  }

  const secret = decrypt(deps.config.encryptionKey, totp.secret);
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
      await deps.db.userTotp.update({
        where: { userId: challenge.userId },
        data: { recoveryCodes: result.remaining },
      });
    }
  }

  if (!valid) {
    throw new TRPCAccessError('Invalid code');
  }

  await deps.db.twoFactorChallenge.delete({ where: { id: challenge.id } });
  setCookie(TWO_FACTOR_COOKIE, '', { maxAge: 0 });

  const token = generateSessionToken();
  const session = await createSession(deps, token, challenge.userId);
  setSessionTokenCookie(deps.config, setCookie, token, session.expiresAt);
  setLastAuthProviderCookie(deps.config, setCookie, 'email');

  const inviteId = cookies.get(INVITE_COOKIE);
  if (inviteId) {
    await consumeInviteForUser(deps, challenge.userId, inviteId, logger);
    setCookie(INVITE_COOKIE, '', { maxAge: 0 });
  }

  return { type: 'email' };
}

export async function getTotpStatus(deps: ServiceDeps, userId: string) {
  const [totp, emailAccount] = await Promise.all([
    deps.db.userTotp.findUnique({ where: { userId } }),
    deps.db.account.findFirst({
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

export async function setupTotp(deps: ServiceDeps, userId: string) {
  const emailAccount = await deps.db.account.findFirst({
    where: { userId, provider: 'email' },
    select: { id: true },
  });
  if (!emailAccount) {
    throw new TRPCAccessError(
      'Two-factor authentication is only available for email/password sign-ins. Your account uses a social provider, which handles 2FA on its end.'
    );
  }
  const existing = await deps.db.userTotp.findUnique({ where: { userId } });
  if (existing?.enabledAt) {
    throw new TRPCAccessError(
      'Two-factor is already enabled. Disable it first to re-configure.'
    );
  }

  const user = await deps.db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  });

  const secret = generateTotpSecret();
  const otpauthUrl = buildOtpauthUrl({ secret, accountName: user.email });
  const qrDataUrl = await generateQrDataUrl(otpauthUrl);

  await deps.db.userTotp.upsert({
    where: { userId },
    create: {
      userId,
      secret: encrypt(deps.config.encryptionKey, secret),
      recoveryCodes: [],
    },
    update: {
      secret: encrypt(deps.config.encryptionKey, secret),
      recoveryCodes: [],
      enabledAt: null,
    },
  });

  return { otpauthUrl, qrDataUrl, secret };
}

export async function enableTotp(
  deps: ServiceDeps,
  userId: string,
  code: string
) {
  const totp = await deps.db.userTotp.findUnique({ where: { userId } });
  if (!totp) {
    throw new TRPCNotFoundError('Start two-factor setup first');
  }
  if (totp.enabledAt) {
    throw new TRPCAccessError('Two-factor is already enabled');
  }

  const secret = decrypt(deps.config.encryptionKey, totp.secret);
  if (!verifyTotpCode(secret, code)) {
    throw new TRPCAccessError('Invalid code');
  }

  const recoveryCodes = generateRecoveryCodes();
  const hashed = await hashRecoveryCodes(recoveryCodes);

  await deps.db.userTotp.update({
    where: { userId },
    data: { enabledAt: new Date(), recoveryCodes: hashed },
  });

  return { recoveryCodes };
}

export async function disableTotp(
  deps: ServiceDeps,
  userId: string,
  code: string
) {
  const totp = await deps.db.userTotp.findUnique({ where: { userId } });
  if (!totp?.enabledAt) {
    throw new TRPCAccessError('Two-factor is not enabled');
  }

  const secret = decrypt(deps.config.encryptionKey, totp.secret);
  const isTotpCode = /^\d{6}$/.test(code.replace(/\s+/g, ''));
  const valid = isTotpCode
    ? verifyTotpCode(secret, code)
    : (await consumeRecoveryCode({ hashes: totp.recoveryCodes, input: code }))
        .valid;

  if (!valid) {
    throw new TRPCAccessError('Invalid code');
  }

  await deps.db.userTotp.delete({ where: { userId } });
  await deps.db.twoFactorChallenge.deleteMany({ where: { userId } });
  return { disabled: true };
}

export async function regenerateTotpRecoveryCodes(
  deps: ServiceDeps,
  userId: string,
  code: string
) {
  const totp = await deps.db.userTotp.findUnique({ where: { userId } });
  if (!totp?.enabledAt) {
    throw new TRPCAccessError('Two-factor is not enabled');
  }
  const secret = decrypt(deps.config.encryptionKey, totp.secret);
  if (!verifyTotpCode(secret, code)) {
    throw new TRPCAccessError('Invalid code');
  }
  const recoveryCodes = generateRecoveryCodes();
  const hashed = await hashRecoveryCodes(recoveryCodes);
  await deps.db.userTotp.update({
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
  deps: ServiceDeps,
  input: ResetPasswordInput
): Promise<true> {
  const resetPassword = await deps.db.resetPassword.findUnique({
    where: { id: input.token },
  });

  if (!resetPassword) {
    throw new TRPCNotFoundError('Reset password not found');
  }
  if (resetPassword.expiresAt < new Date()) {
    throw new TRPCNotFoundError('Reset password expired');
  }

  await deps.db.account.update({
    where: { id: resetPassword.accountId },
    data: { password: await hashPassword(input.password) },
  });
  await deps.db.resetPassword.delete({ where: { id: input.token } });

  return true;
}

export async function requestPasswordReset(
  deps: ServiceDeps,
  input: {
    email: string;
  }
): Promise<true> {
  const user = await getUserAccount(deps, {
    email: input.email,
    provider: 'email',
  });
  // Deliberately not found-vs-found: V1 always returns `true` here so the
  // endpoint cannot be used to enumerate registered emails.
  if (!user?.account.id) {
    return true;
  }

  await deps.db.resetPassword.deleteMany({
    where: { accountId: user.account.id },
  });

  const token = generateSecureId('pw');
  const expiresAt = new Date(Date.now() + RESET_PASSWORD_TTL_MS);
  await deps.db.resetPassword.create({
    data: { id: token, expiresAt, accountId: user.account.id },
  });

  await sendEmail('reset-password', {
    to: input.email,
    data: {
      url: `${deps.config.dashboardUrl}/reset-password?token=${token}`,
    },
  });

  return true;
}

export async function extendSessionCookie(
  deps: ServiceDeps,
  cookies: CookieReader,
  hasSession: boolean,
  setCookie: ISetCookie
): Promise<{ extended: boolean; expiresAt?: Date }> {
  const token = cookies.get('session');
  if (!(hasSession && token)) {
    return { extended: false };
  }

  const session = await validateSessionToken(deps, token);

  if (session.session) {
    setSessionTokenCookie(
      deps.config,
      setCookie,
      token,
      session.session.expiresAt
    );
    return { extended: true, expiresAt: session.session.expiresAt };
  }

  return { extended: false };
}

export interface SignInShareInput {
  password: string;
  shareId: string;
  shareType?: 'overview' | 'dashboard' | 'report';
}

/** Share's three lookups arrive through the composition root's thunk
 *  (ADR-022 R3), not a dynamic import: `share.service.ts` statically imports
 *  this file's `hashPassword`, so a static edge back would be a real cycle. */
/** A week, as V1's `maxAge` was. */
const SHARE_ACCESS_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export async function signInToShare(
  deps: ServiceDeps,
  services: () => Services,
  input: SignInShareInput,
  setCookie: ISetCookie
): Promise<true> {
  const { password, shareId, shareType = 'overview' } = input;
  const { getShareOverviewById, getShareDashboardById, getShareReportById } =
    services().share;

  let share: { password: string | null; public: boolean } | null = null;

  if (shareType === 'overview') {
    share = await getShareOverviewById(shareId);
  } else if (shareType === 'dashboard') {
    share = await getShareDashboardById(shareId);
  } else if (shareType === 'report') {
    share = await getShareReportById(shareId);
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
    // FORBIDDEN so the dashboard's 401 handler does not log the viewer out.
    throw new TRPCForbiddenError('Incorrect password');
  }

  // The value is the proof, not the presence: a constant let anyone unlock a
  // password-protected share by inventing the cookie (GHSA-p6c2-mq9r-cx3r).
  setCookie(
    shareAccessCookieName(shareType, shareId),
    createShareAccessToken(deps.config.cookies.secret, {
      type: shareType,
      id: shareId,
      passwordHash: share.password,
    }),
    { maxAge: SHARE_ACCESS_MAX_AGE_SECONDS }
  );
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

export async function fetchGithubOAuthUser(
  config: CoreConfig,
  code: string
): Promise<OAuthUser> {
  const tokens = await githubClient(config).validateAuthorizationCode(code);
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
  config: CoreConfig,
  code: string,
  codeVerifier: string
): Promise<OAuthUser> {
  const tokens = await googleClient(config).validateAuthorizationCode(
    code,
    codeVerifier
  );
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
  deps: ServiceDeps,
  input: CompleteOAuthCallbackInput
): Promise<void> {
  const { provider, oauthUser, inviteId, setCookie, logger } = input;

  const account = await deps.db.account.findFirst({
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
    await completeExistingOAuthUser(deps, {
      account,
      oauthUser,
      provider,
      inviteId,
      setCookie,
      logger,
    });
    return;
  }

  await completeNewOAuthUser(deps, {
    oauthUser,
    provider,
    inviteId,
    setCookie,
    logger,
  });
}

async function completeExistingOAuthUser(
  deps: ServiceDeps,
  {
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
  }
) {
  const sessionToken = generateSessionToken();
  const session = await createSession(deps, sessionToken, account.userId);

  await deps.db.account.update({
    where: { id: account.id },
    data: { provider, providerId: oauthUser.id, email: oauthUser.email },
  });

  if (inviteId) {
    await consumeInviteForUser(deps, account.userId, inviteId, logger);
  }

  setSessionTokenCookie(
    deps.config,
    setCookie,
    sessionToken,
    session.expiresAt
  );
  setLastAuthProviderCookie(deps.config, setCookie, provider);
}

async function completeNewOAuthUser(
  deps: ServiceDeps,
  {
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
  }
) {
  const existingUser = await deps.db.user.findFirst({
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
  if (!(await getIsRegistrationAllowed(deps, inviteId))) {
    // Deliberately no `oauthUser` here — this rejects people who are not
    // users, so their email and name shouldn't land in application logs.
    throw new OAuthCallbackError('Registrations are not allowed', {
      provider,
      inviteId,
    });
  }

  const user = await deps.db.user.create({
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
      await connectUserToOrganization(deps, { user, inviteId });
    } catch (error) {
      logger.error(
        { error, inviteId, user },
        'error connecting user to organization'
      );
    }
  }

  const sessionToken = generateSessionToken();
  const session = await createSession(deps, sessionToken, user.id);
  setSessionTokenCookie(
    deps.config,
    setCookie,
    sessionToken,
    session.expiresAt
  );
  setLastAuthProviderCookie(deps.config, setCookie, provider);
}
