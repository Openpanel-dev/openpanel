// Where the session cookie becomes a session.
//
// `HttpCtx.session` memoizes this call, so a request that asks twice pays once,
// and the cookie is read through `HttpCtx` rather than through a plugin whose
// registration order could put it after the guard that needs it.
//
// The flow is: decode, `runWithAlsSession`, validate. The `DEMO_USER_ID`
// branch lives inside `validateSessionToken` itself, so the no-cookie path
// still goes through it rather than short-circuiting here.
//
// Both halves arrive as `ctx.services.auth`, not as a deep import of
// `modules/auth/src/*`. The derive in `http/context.ts` builds the `Ctx` before
// it installs this resolver and the resolver is lazy, so the services graph is
// there by the time a guard asks for a session — a request that never asks
// (every `/track`) still builds none.
//
// `null` means "nobody is signed in", NOT `EMPTY_SESSION`: the `session` macro,
// the bull-board guard and the four `/live` handlers all treat the resolved
// value as truthy-means-authenticated. tRPC is the one caller that wants the
// empty shape instead, and `makeTrpcContext` maps `null` back to
// `EMPTY_SESSION` there.

import type { Ctx, Session } from '../context';
import { runWithAlsSession } from '../shared/als-session';
import type { CookieJar } from '../shared/cookie';

export const SESSION_COOKIE_NAME = 'session';

/** ALS scope for the demo branch. */
const DEMO_ALS_SESSION_ID = '1';

export async function resolveSession(
  ctx: Ctx,
  cookies: CookieJar,
  _headers: Headers
): Promise<Session | null> {
  const token = cookies.get(SESSION_COOKIE_NAME);
  const auth = ctx.services.auth;

  try {
    const result = await runWithAlsSession(
      token ? auth.decodeSessionToken(token) : DEMO_ALS_SESSION_ID,
      () => auth.validateSessionToken(token ?? null)
    );
    return result.userId === null ? null : result;
  } catch {
    // A malformed cookie resolves to null (nobody signed in) rather than a 500.
    return null;
  }
}
