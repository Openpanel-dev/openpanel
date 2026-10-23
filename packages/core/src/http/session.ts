// `HttpCtx.session` memoizes this call. Order: the demo user, better-auth's
// cookie, then the legacy `session` cookie, whose session is handed
// better-auth's cookie on the way out so the legacy path drains by itself.
//
// `null` means "nobody is signed in", NOT `EMPTY_SESSION`: the `session` macro,
// the bull-board guard and the `/live` handlers treat the resolved value as
// truthy-means-authenticated. `makeTrpcContext` maps `null` to `EMPTY_SESSION`.

import type { Ctx, Session } from '../context';
import { runWithAlsSession } from '../shared/als-session';
import type { CookieJar, ISetCookie } from '../shared/cookie';

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

export interface SessionRequest {
  cookies: CookieJar;
  headers: Headers;
  setCookie: ISetCookie;
}

export async function resolveSession(
  ctx: Ctx,
  { cookies, headers, setCookie }: SessionRequest
): Promise<Session | null> {
  const auth = ctx.services.auth;

  // No catch on either lookup: only the database throws, and answering `null`
  // would be a 401 that signs every user out during a blip; a 500 makes the
  // client retry.
  if (ctx.config.demoUserId) {
    const demo = await runWithAlsSession(DEMO_ALS_SESSION_ID, () =>
      auth.validateSessionToken(null)
    );
    return demo.userId === null ? null : demo;
  }

  const session = await auth.getAuthSession(headers, setCookie);
  if (session) {
    return session;
  }

  for (const token of sessionTokens(cookies, headers)) {
    const result = await runWithAlsSession(auth.decodeSessionToken(token), () =>
      auth.validateSessionToken(token)
    );
    if (result.userId !== null) {
      await auth.upgradeLegacySession(result.session, token, setCookie);
      return result;
    }
  }
  return null;
}
