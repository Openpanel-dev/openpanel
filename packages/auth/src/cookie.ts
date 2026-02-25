import type { ISetCookie } from '@openpanel/validation';
import { COOKIE_OPTIONS } from '../constants';

export function setSessionTokenCookie(
  setCookie: ISetCookie,
  token: string,
  expiresAt: Date
): void {
  setCookie('session', token, {
    maxAge: Math.floor((expiresAt.getTime() - new Date().getTime()) / 1000),
    ...COOKIE_OPTIONS,
  });
}

export function deleteSessionTokenCookie(setCookie: ISetCookie): void {
  setCookie('session', '', {
    maxAge: 0,
    ...COOKIE_OPTIONS,
  });
}
