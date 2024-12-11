export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const COOKIE_OPTIONS = {
  domain: process.env.NEXT_PUBLIC_DASHBOARD_URL?.replace('https://', ''),
  sameSite: 'lax',
  httpOnly: true,
  secure: true,
  path: '/',
} as const;
