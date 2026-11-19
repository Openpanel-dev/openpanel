import type { CoreConfig } from '../../../config';
import type { ISetCookie } from '../../../shared/cookie';
import { cookieOptions } from './constants';

export function deleteSessionTokenCookie(
  config: CoreConfig,
  setCookie: ISetCookie
): void {
  setCookie('session', '', {
    maxAge: 0,
    ...cookieOptions(config),
  });
}
