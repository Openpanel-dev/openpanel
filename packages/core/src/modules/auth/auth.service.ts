// Moved from @openpanel/auth (M4-007). Only the DB-independent half lives
// here: token issuance/hashing, argon2 password hashing, TOTP, the OAuth
// clients and cookie helpers. The Prisma-touching half — creating,
// validating and invalidating a `sessions` row — stays in @openpanel/db's
// auth-session.service.ts, because @openpanel/db already depends on
// @openpanel/core (for exactly this module's token hash) and the reverse
// edge would be a cycle. That file calls back into `hashSessionToken` below.

import type { ServiceDeps } from '../../services';
import type { ISetCookie } from '../../shared/cookie';
import {
  deleteSessionTokenCookie,
  setLastAuthProviderCookie,
  setSessionTokenCookie,
} from './src/cookie';
import { parseCookieDomain } from './src/cookie-domain';
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
