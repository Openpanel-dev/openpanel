import type { CoreConfig } from '../../../config';
import type { ISetCookie } from '../../../shared/cookie';
import { cookieOptions } from './constants';

const LAST_AUTH_PROVIDER_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function setSessionTokenCookie(
  config: CoreConfig,
  setCookie: ISetCookie,
  token: string,
  expiresAt: Date
): void {
  setCookie('session', token, {
    maxAge: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    ...cookieOptions(config),
  });
}

export function setLastAuthProviderCookie(
  config: CoreConfig,
  setCookie: ISetCookie,
  provider: string
): void {
  setCookie('last-auth-provider', provider, {
    maxAge: LAST_AUTH_PROVIDER_MAX_AGE_SECONDS,
    ...cookieOptions(config),
  });
}

export function deleteSessionTokenCookie(
  config: CoreConfig,
  setCookie: ISetCookie
): void {
  setCookie('session', '', {
    maxAge: 0,
    ...cookieOptions(config),
  });
}
