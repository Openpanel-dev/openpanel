import { parseCookieDomain } from './parse-cookie-domain';

const parsed = parseCookieDomain(
  (process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL) ?? '',
);

export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const COOKIE_OPTIONS = {
  domain: parsed.domain,
  secure: parsed.secure,
  sameSite: 'lax',
  httpOnly: true,
  path: '/',
} as const;
