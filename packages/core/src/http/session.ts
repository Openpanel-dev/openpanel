// Where the session cookie becomes a session.
//
// `HttpCtx.session()` memoizes this call, so a request that asks twice pays
// once, and the cookie is read through `HttpCtx` rather than through a plugin
// whose registration order could put it after the guard that needs it
// (ADR-002 "behaviour that must be preserved explicitly" 1).
//
// M9-004 filled the body in, porting apps/api/src/app.ts's dashboard-scope
// `onRequest` hook: decode, `runWithAlsSession`, validate, and V1's
// DEMO_USER_ID branch — which lives inside `validateSessionToken` itself, so
// the no-cookie path still goes through it rather than short-circuiting here.
//
// `null` means "nobody is signed in", NOT `EMPTY_SESSION`: the `session`
// macro, the bull-board guard and the four `/live` handlers all treat the
// resolved value as truthy-means-authenticated. tRPC is the one caller that
// wants V1's empty shape instead, and `makeTrpcContext` maps `null` back to
// `EMPTY_SESSION` there.

import type { AppDeps, Session } from '../context';
import { validateSessionToken } from '../modules/auth/src/login-session';
import { decodeSessionToken } from '../modules/auth/src/token';
import { runWithAlsSession } from '../modules/session/src/session-context';
import type { CookieJar } from '../shared/cookie';

export const SESSION_COOKIE_NAME = 'session';

/** V1's ALS scope for the demo branch (apps/api/src/app.ts:163). */
const DEMO_ALS_SESSION_ID = '1';

export async function resolveSession(
  _deps: AppDeps,
  cookies: CookieJar,
  _headers: Headers
): Promise<Session | null> {
  const token = cookies.get(SESSION_COOKIE_NAME);

  try {
    const result = await runWithAlsSession(
      token ? decodeSessionToken(token) : DEMO_ALS_SESSION_ID,
      () => validateSessionToken(token ?? null)
    );
    return result.userId === null ? null : result;
  } catch {
    // V1 swallowed a malformed cookie into EMPTY_SESSION rather than a 500.
    return null;
  }
}
