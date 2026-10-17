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

// A browser sends every `session` cookie whose domain covers the API host, and
// the parser keeps only the first. A stale one on a parent domain (another
// local setup, an old deploy) would then sign the user out, so each candidate
// gets a turn. One cookie, the common case, costs exactly what it did before.
function sessionTokens(cookies: CookieJar, headers: Headers): string[] {
  const header = headers.get('cookie');
  if (!header) {
    const token = cookies.get(SESSION_COOKIE_NAME);
    return token ? [token] : [];
  }
  const tokens = new Set<string>();
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (pair.slice(0, separator).trim() !== SESSION_COOKIE_NAME) {
      continue;
    }
    const value = pair.slice(separator + 1).trim();
    if (value) {
      tokens.add(decodeURIComponent(value));
    }
  }
  return [...tokens];
}

export async function resolveSession(
  ctx: Ctx,
  cookies: CookieJar,
  headers: Headers
): Promise<Session | null> {
  const auth = ctx.services.auth;
  const tokens = sessionTokens(cookies, headers);

  // No catch: decoding is a hash and cannot fail, so only the database throws.
  // Answering `null` would be a 401 and sign every user out during a blip; a
  // 500 makes the client retry.
  if (tokens.length === 0) {
    const result = await runWithAlsSession(DEMO_ALS_SESSION_ID, () =>
      auth.validateSessionToken(null)
    );
    return result.userId === null ? null : result;
  }

  for (const token of tokens) {
    const result = await runWithAlsSession(auth.decodeSessionToken(token), () =>
      auth.validateSessionToken(token)
    );
    if (result.userId !== null) {
      return result;
    }
  }
  return null;
}
