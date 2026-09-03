// Read at import time, not through config/env.ts: this is the same pragmatic
// deviation @openpanel/db and @openpanel/redis take (TARGET_ARCHITECTURE §7)
// — ported from @openpanel/auth unchanged rather than threaded through
// AppDeps, which would make every module reachable from a session cookie
// carry a dependency on this one.
import { parseCookieDomain } from './cookie-domain';

const parsed = parseCookieDomain(
  (process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL) ?? ''
);

export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const COOKIE_OPTIONS = {
  domain: parsed.domain,
  secure: parsed.secure,
  sameSite: 'lax',
  httpOnly: true,
  path: '/',
} as const;
