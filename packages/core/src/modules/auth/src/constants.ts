// Deployment-derived: the session cookie's domain and `secure` flag come from
// the dashboard's own URL, so they are computed from the config the boot path
// already holds rather than read at import (ADR-022 R7).
import type { CoreConfig } from '../../../config';
import type { CookieOptions } from '../../../shared/cookie';
import { parseCookieDomain } from './cookie-domain';

export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function cookieOptions(config: CoreConfig): CookieOptions {
  const parsed = parseCookieDomain(config, config.dashboardUrl);
  return {
    domain: parsed.domain,
    secure: parsed.secure,
    sameSite: 'lax',
    httpOnly: true,
    path: '/',
  };
}
