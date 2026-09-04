// Moved from packages/db/src/session-context.ts (M7-001; module map: session
// owns session-context). The ALS scopes a request's dashboard session id so
// anything downstream — today only the Prisma read-replica consistency
// extension ADR-012 retires — can read it without threading a parameter.
// packages/db keeps a re-export shim for its V1 callers.

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
