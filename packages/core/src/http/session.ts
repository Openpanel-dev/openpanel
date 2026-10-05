// `HttpCtx.session` memoizes this call. The flow is decode, `runWithAlsSession`,
// validate; the `DEMO_USER_ID` branch lives inside `validateSessionToken`, so the
// no-cookie path still goes through it.
//
// `null` means "nobody is signed in", NOT `EMPTY_SESSION`: the `session` macro,
// the bull-board guard and the `/live` handlers treat the resolved value as
// truthy-means-authenticated. `makeTrpcContext` maps `null` to `EMPTY_SESSION`.

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

  // No catch: decoding is a hash and cannot fail, so only the database throws.
  // Answering `null` would be a 401 and sign every user out during a blip; a
  // 500 makes the client retry.
  const result = await runWithAlsSession(
    token ? auth.decodeSessionToken(token) : DEMO_ALS_SESSION_ID,
    () => auth.validateSessionToken(token ?? null)
  );
  return result.userId === null ? null : result;
}
