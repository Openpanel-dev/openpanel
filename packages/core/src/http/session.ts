// Where the session cookie becomes a session.
//
// P2 lands the plumbing, not the resolution: `HttpCtx.session()` memoizes this
// call, so a request that asks twice pays once, and the cookie is read through
// `HttpCtx` rather than through a plugin whose registration order could put it
// after the guard that needs it (ADR-002 "behaviour that must be preserved
// explicitly" 1).
//
// P6 fills the body in: decode the token, `runWithAlsSession`, validate, and
// the DEMO_USER_ID branch — plus ADR-002's mandatory test, valid cookie ->
// non-empty session and no cookie -> EMPTY_SESSION. That failure is silent
// (a 401, not an error), which is why the test is not optional.

import type { AppDeps, Session } from '../context';
import type { CookieJar } from '../shared/cookie';

export const SESSION_COOKIE_NAME = 'session';

export function resolveSession(
  _deps: AppDeps,
  _cookies: CookieJar,
  _headers: Headers
): Promise<Session | null> {
  return Promise.resolve(null);
}
