// The one "nobody is signed in" session value, below every transport so
// `rpc/base.ts` and `modules/auth/src/login-session.ts` can both reach it
// without an upward import.

import type { Session } from '../context';

export const EMPTY_SESSION: Session = {
  session: null,
  user: null,
  userId: null,
};
