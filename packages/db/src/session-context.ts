import { AsyncLocalStorage } from 'node:async_hooks';

type Ctx = { sessionId: string | null };

export const als = new AsyncLocalStorage<Ctx>();

export const runWithAlsSession = <T>(
  sid: string | null | undefined,
  fn: () => Promise<T>,
) => als.run({ sessionId: sid || null }, fn);

export const getAlsSessionId = () => als.getStore()?.sessionId ?? null;
