// Both transports open the scope and nothing in the session module reads it, so
// it is request scoping, not session domain logic. Dependency-free —
// `node:async_hooks` and nothing else — so it sits at the bottom, where a
// transport may reach it.
//
// The ALS scopes a request's dashboard session id so anything downstream —
// today only the Prisma read-replica consistency extension ADR-012 retires —
// can read it without threading a parameter.

import { AsyncLocalStorage } from 'node:async_hooks';

interface SessionScope {
  sessionId: string | null;
}

export const als = new AsyncLocalStorage<SessionScope>();

export const runWithAlsSession = <T>(
  sessionId: string | null | undefined,
  fn: () => Promise<T>
) => als.run({ sessionId: sessionId || null }, fn);

export const getAlsSessionId = () => als.getStore()?.sessionId ?? null;
