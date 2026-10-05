// Request scoping, not session domain logic: both transports open the scope and
// nothing in the session module reads it. It holds a request's dashboard session
// id so downstream code (today the Prisma read-replica consistency extension)
// can read it without threading a parameter. Dependency-free, so a transport
// may reach it.

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
