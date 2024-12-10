import type { ISetCookie } from '@openpanel/validation';

export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const COOKIE_OPTIONS = {
  domain: process.env.NEXT_PUBLIC_DASHBOARD_URL?.replace('https://', ''),
  sameSite: 'lax',
  httpOnly: true,
  secure: true,
  path: '/',
} as const;

export function setSessionTokenCookie(
  setCookie: ISetCookie,
  token: string,
  expiresAt: Date,
): void {
  setCookie('session', token, {
    maxAge: expiresAt.getTime() - new Date().getTime(),
    ...COOKIE_OPTIONS,
  });
}

export function deleteSessionTokenCookie(setCookie: ISetCookie): void {
  setCookie('session', '', {
    maxAge: 0,
    ...COOKIE_OPTIONS,
  });
}
