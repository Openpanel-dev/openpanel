import { createHmac, timingSafeEqual } from 'node:crypto';

export type ShareType = 'overview' | 'dashboard' | 'report';

export interface ShareAccessInput {
  type: ShareType;
  /** The public share id — the value in the share link. */
  id: string;
  /** The stored argon2 hash of the share password. */
  passwordHash: string;
}

/** What the rpc/http layer hands in; `CookieJar` and Elysia's cookie both fit. */
interface CookieReader {
  get(name: string): string | undefined;
}

export function shareAccessCookieName(type: ShareType, id: string): string {
  return `shared-${type}-${id}`;
}

function requireSecret(secret: string): string {
  if (!secret) {
    throw new Error(
      'COOKIE_SECRET is not set; password-protected shares cannot be unlocked without it'
    );
  }
  return secret;
}

/**
 * An HMAC over the share type, share id and the *current* password hash, so the
 * cookie cannot be forged, replayed against another share, or outlive a
 * password change. Checking only that the cookie existed let anyone bypass the
 * password (GHSA-p6c2-mq9r-cx3r).
 */
export function createShareAccessToken(
  secret: string,
  { type, id, passwordHash }: ShareAccessInput
): string {
  return createHmac('sha256', requireSecret(secret))
    .update(`share-access:${type}:${id}:${passwordHash}`)
    .digest('base64url');
}

export function hasShareAccess(
  secret: string,
  cookies: CookieReader,
  share: ShareAccessInput
): boolean {
  const presented = cookies.get(shareAccessCookieName(share.type, share.id));
  if (!presented) {
    return false;
  }

  const expected = Buffer.from(createShareAccessToken(secret, share));
  const actual = Buffer.from(presented);
  // timingSafeEqual throws on a length mismatch, so the length is compared first.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
