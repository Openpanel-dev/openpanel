import type { ISetCookie } from '@openpanel/validation';
import { COOKIE_OPTIONS } from '../constants';

export function setSessionTokenCookie(
  setCookie: ISetCookie,
  token: string,
  expiresAt: Date
): void {
  setCookie('session', token, {
    maxAge: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    ...COOKIE_OPTIONS,
  });
}

export function setLastAuthProviderCookie(
  setCookie: ISetCookie,
  provider: string
): void {
  setCookie('last-auth-provider', provider, {
    maxAge: 60 * 60 * 24 * 365,
    ...COOKIE_OPTIONS,
  });
}

export function deleteSessionTokenCookie(setCookie: ISetCookie): void {
  setCookie('session', '', {
    maxAge: 0,
    ...COOKIE_OPTIONS,
  });
}
