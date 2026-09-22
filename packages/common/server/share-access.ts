import { createHmac, timingSafeEqual } from 'node:crypto';

export type ShareType = 'overview' | 'dashboard' | 'report';

export interface ShareAccessInput {
  type: ShareType;
  /** The public share id (the value in the share link). */
  id: string;
  /** The stored argon2 hash of the share password. */
  passwordHash: string;
}

/**
 * Proof that a viewer entered the password of a password-protected share.
 *
 * The cookie value is an HMAC over the share type, share id and the current
 * password hash, so it cannot be forged without COOKIE_SECRET, cannot be
 * replayed against a different share, and stops working when the owner
 * changes or removes the password. Checking only that the cookie exists is
 * what let anyone bypass the password (GHSA-p6c2-mq9r-cx3r).
 */
export function shareAccessCookieName(type: ShareType, id: string): string {
  return `shared-${type}-${id}`;
}

function getCookieSecret(): string {
  const secret = process.env.COOKIE_SECRET;
  if (!secret) {
    throw new Error('COOKIE_SECRET environment variable is not set');
  }
  return secret;
}

export function createShareAccessToken({
  type,
  id,
  passwordHash,
}: ShareAccessInput): string {
  return createHmac('sha256', getCookieSecret())
    .update(`share-access:${type}:${id}:${passwordHash}`)
    .digest('base64url');
}

export function hasShareAccess(
  cookies: Record<string, string | undefined> | undefined,
  share: ShareAccessInput,
): boolean {
  const presented = cookies?.[shareAccessCookieName(share.type, share.id)];
  if (!presented) {
    return false;
  }

  const expected = Buffer.from(createShareAccessToken(share));
  const actual = Buffer.from(presented);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
