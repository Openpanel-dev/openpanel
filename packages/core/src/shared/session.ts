// The one "nobody is signed in" session value.
//
// It lives below every transport on purpose: `rpc/base.ts` maps
// `HttpCtx.session`'s `null` onto it at the tRPC boundary, and
// `modules/auth/src/login-session.ts` returns it from every non-session branch
// of `validateSessionToken`. Defining it in the module and reaching for it from
// `rpc/` was the shortest path to working code and an upward import; one
// constant at the bottom of the stack is the same behaviour with no edge.

import type { Session } from '../context';

export const EMPTY_SESSION: Session = {
  session: null,
  user: null,
  userId: null,
};
