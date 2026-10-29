import type { Session } from '@openpanel/db/src/prisma-client';
import type { CoreConfig } from '../../config';
import type { ServiceDeps, Services } from '../../services';
import {
  canWriteProject,
  getClientAccess as getClientAccessLookup,
  getOrganizationAccess as getOrganizationAccessLookup,
  getProjectAccess as getProjectAccessLookup,
  getProjectById,
  type IOrganizationAccess,
  type IProjectAccess,
} from '../../shared/access-lookups';
import type { ISetCookie } from '../../shared/cookie';
import {
  isOrganizationAdminRole,
  normalizeOrganizationRole,
  type OrganizationRole,
} from '../organization/organization.constants';
import { INVITE_HEADER } from './auth.constants';
import { type AccessChecks, createAccessChecks } from './src/access';
import {
  type AuthSessionResult,
  deleteAuthSessionCookie,
  getAuthSession,
  type PasswordSignInResult,
  signInWithPassword,
  upgradeLegacySession,
} from './src/better-auth';
import { deleteSessionTokenCookie } from './src/cookie';
import { parseCookieDomain } from './src/cookie-domain';
import { isOAuthClientConfigured } from './src/oauth';
import { hashPassword, verifyPasswordHash } from './src/password';
import { decodeSessionToken, hashSessionToken } from './src/token';

// Re-exported from source: the imports above are also used by
// `createAuthService`, so re-exporting them would trip `noExportedImports`.
export { COOKIE_MAX_AGE, cookieOptions } from './src/constants';
export { parseCookieDomain } from './src/cookie-domain';
export type { OAuth2Tokens } from './src/oauth';
export { Arctic, googleGscClient } from './src/oauth';
export { hashPassword, verifyPasswordHash } from './src/password';

/** The ladder contract this module binds and `createAuthService` satisfies. */
type ProjectAccessChecks = AccessChecks<IProjectAccess>;

let accessChecksPromise: Promise<ProjectAccessChecks> | undefined;

/**
 * Memoized: the ladder is bound once per process, on the first check. Binding
 * at module scope hung `bun test`.
 *
 * `integration.service.ts` and `subscription.service.ts` import this directly
 * because they are called with a bare `userId` and no `ctx`.
 */
export function getAccessChecks(): Promise<ProjectAccessChecks> {
  if (!accessChecksPromise) {
    accessChecksPromise = Promise.resolve(
      createAccessChecks({
        getProjectAccess: getProjectAccessLookup,
        canWriteProject,
        getOrganizationAccess: getOrganizationAccessLookup,
        isOrganizationAdmin: (access) =>
          !!access &&
          isOrganizationAdminRole(normalizeOrganizationRole(access.role)),
        getProjectById,
      })
    );
  }
  return accessChecksPromise;
}

/**
 * Test-only. The binding is a process-lifetime singleton, so a test that mocks
 * the lookups must clear it or, without `--isolate`, later files get the fakes.
 */
export function resetAccessChecksForTests(): void {
  accessChecksPromise = undefined;
}

/**
 * Login check for the share-aware procedures, which are public because a valid
 * share link is an alternative to being signed in. `protectedProcedure`
 * already refuses anonymous callers.
 */
export function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

/**
 * Ignores both arguments: the access lookups are `cacheable`, keyed by call
 * arguments, so they cannot take a leading `deps`.
 */
export function createAuthService(
  deps: ServiceDeps,
  _services: () => Services
) {
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

  async function getOrganizationAccess(
    ...args: Parameters<typeof getOrganizationAccessLookup>
  ): Promise<
    (Omit<IOrganizationAccess, 'role'> & { role: OrganizationRole }) | null
  > {
    const access = await getOrganizationAccessLookup(...args);
    if (!access) {
      return null;
    }
    return { ...access, role: normalizeOrganizationRole(access.role) };
  }

  function getClientAccess(
    ...args: Parameters<typeof getClientAccessLookup>
  ): ReturnType<typeof getClientAccessLookup> {
    return getClientAccessLookup(...args);
  }

  function checkSessionToken(
    token: string | null | undefined
  ): Promise<SessionValidationResult> {
    return validateSessionToken(deps, token);
  }

  /** Both cookies: a legacy session also carries better-auth's once upgraded. */
  function clearSessionCookies(setCookie: ISetCookie): void {
    deleteSessionTokenCookie(deps.config, setCookie);
    deleteAuthSessionCookie(deps.config, setCookie);
  }

  function getSession(
    headers: Headers,
    setCookie: ISetCookie
  ): Promise<AuthSessionResult | null> {
    if (!deps.auth) {
      return Promise.resolve(null);
    }
    return getAuthSession(deps.auth, deps.config, headers, setCookie);
  }

  async function upgradeSession(
    session: Session,
    setCookie: ISetCookie
  ): Promise<void> {
    if (!(deps.auth && deps.config.auth.secret)) {
      return;
    }
    await upgradeLegacySession(
      deps,
      deps.config.auth.secret,
      session,
      setCookie
    );
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
    getAuthSession: getSession,
    upgradeLegacySession: upgradeSession,
    getProjectAccess,
    getOrganizationAccess,
    getClientAccess,
    hashPassword,
    verifyPasswordHash,
    decodeSessionToken,
    hashSessionToken,
    clearSessionCookies,
    parseCookieDomain: cookieDomainForUrl,
  };
}

import {
  TRPCAccessError,
  TRPCBadRequestError,
  TRPCForbiddenError,
  TRPCNotFoundError,
} from '../../rpc/errors';
import {
  createShareAccessToken,
  shareAccessCookieName,
} from '../../shared/share-access';
import {
  invalidateSession,
  type SessionValidationResult,
  validateSessionToken,
} from './src/login-session';

const CREDENTIAL_PROVIDER = 'credential';

export async function signOutUser(
  deps: ServiceDeps,
  setCookie: ISetCookie,
  sessionId: string | null | undefined
): Promise<void> {
  deleteSessionTokenCookie(deps.config, setCookie);
  deleteAuthSessionCookie(deps.config, setCookie);
  if (sessionId) {
    await invalidateSession(deps, sessionId);
  }
}

export interface ConfiguredProviders {
  google: boolean;
  github: boolean;
  gsc: boolean;
  devLogin: boolean;
}

/** Report availability only; OAuth credentials never leave the server. */
export function getConfiguredProviders(
  config: CoreConfig
): ConfiguredProviders {
  const { google, github, googleGsc, devLogin } = config.auth;
  return {
    google: isOAuthClientConfigured(google),
    github: isOAuthClientConfigured(github),
    gsc: isOAuthClientConfigured(googleGsc),
    devLogin: devLogin !== undefined,
  };
}

/**
 * The configured `DEV_LOGIN` credentials go through the ordinary email
 * sign-in, so the account must exist and the password must match; the
 * credentials themselves never leave the API.
 */
export function signInWithDevLogin(
  deps: ServiceDeps,
  input: { inviteId?: string | null },
  headers: Headers,
  setCookie: ISetCookie
): Promise<PasswordSignInResult> {
  const devLogin = deps.config.auth.devLogin;
  if (!(devLogin && deps.auth)) {
    throw new TRPCBadRequestError(
      'Dev login is not configured on this deployment'
    );
  }
  const signInHeaders = new Headers(headers);
  signInHeaders.delete(INVITE_HEADER);
  if (input.inviteId) {
    signInHeaders.set(INVITE_HEADER, input.inviteId);
  }
  return signInWithPassword(
    deps.auth,
    deps.config,
    devLogin,
    signInHeaders,
    setCookie
  );
}

export interface TwoFactorStatus {
  enabled: boolean;
  /** Two-factor is for password sign-ins; Google and GitHub run their own. */
  hasPassword: boolean;
  /** Had two-factor before sign-in moved to better-auth, and not since. */
  wasReset: boolean;
}

export async function getTwoFactorStatus(
  deps: ServiceDeps,
  userId: string
): Promise<TwoFactorStatus> {
  const [user, credential, legacyTotp] = await Promise.all([
    deps.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    }),
    deps.db.account.findFirst({
      where: { userId, provider: CREDENTIAL_PROVIDER },
      select: { id: true },
    }),
    deps.db.userTotp.findUnique({
      where: { userId },
      select: { enabledAt: true },
    }),
  ]);
  return {
    enabled: user.twoFactorEnabled,
    hasPassword: Boolean(credential),
    wasReset: Boolean(legacyTotp?.enabledAt) && !user.twoFactorEnabled,
  };
}

export interface SignInShareInput {
  password: string;
  shareId: string;
  shareType?: 'overview' | 'dashboard' | 'report';
}

/** `share.service.ts` statically imports `hashPassword` from this file, so
 * share is reached through the `services` thunk to avoid an import cycle. */
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
