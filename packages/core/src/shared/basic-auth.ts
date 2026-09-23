// HTTP Basic auth for operator-only surfaces. Browsers prompt for the
// credentials, so such a surface needs no UI of its own.
//
// Ported from apps/worker/src/utils/basic-auth.ts (main #511) as a plain
// predicate: express middleware has no home here, and the caller decides what
// a refusal looks like on its transport.

import { timingSafeEqual } from 'node:crypto';

export interface BasicAuthCredentials {
  username: string;
  password: string;
}

const BASIC_SCHEME = 'basic';

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, so the length is compared first.
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Whether an `Authorization` header carries exactly these credentials. */
export function matchesBasicAuth(
  header: string | null | undefined,
  expected: BasicAuthCredentials
): boolean {
  const [scheme, encoded] = (header ?? '').split(' ');
  if (scheme?.toLowerCase() !== BASIC_SCHEME || !encoded) {
    return false;
  }

  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator === -1) {
    return false;
  }

  return (
    safeEqual(decoded.slice(0, separator), expected.username) &&
    safeEqual(decoded.slice(separator + 1), expected.password)
  );
}

/** The header that makes a browser show its credentials prompt. */
export function basicAuthChallenge(realm: string): Record<string, string> {
  return { 'WWW-Authenticate': `Basic realm="${realm}"` };
}
