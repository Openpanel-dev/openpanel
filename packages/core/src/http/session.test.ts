import { expect, test } from 'bun:test';
import { stubAppDeps } from '../../test/http-fixtures';
import { type AppDeps, createCtx } from '../context';
import { resolveSession } from './session';

const NO_HEADERS = new Headers();

function ctxWithSessionLookup(findUnique: () => Promise<unknown>) {
  const { deps, logger } = stubAppDeps();
  const db = { session: { findUnique } } as unknown as AppDeps['db'];
  return createCtx({ ...deps, db }, { requestId: 'req-1', logger });
}

function cookieJar(token: string | undefined) {
  return { get: (name: string) => (name === 'session' ? token : undefined) };
}

test('a cookie that matches no session resolves to nobody signed in', async () => {
  const ctx = ctxWithSessionLookup(() => Promise.resolve(null));

  expect(
    await resolveSession(ctx, cookieJar('not-a-real-token'), NO_HEADERS)
  ).toBeNull();
});

test('no cookie resolves to nobody signed in without touching the database', async () => {
  const ctx = ctxWithSessionLookup(() =>
    Promise.reject(new Error('should not be called'))
  );

  expect(
    await resolveSession(ctx, cookieJar(undefined), NO_HEADERS)
  ).toBeNull();
});

test('a failing session lookup propagates instead of signing the user out', async () => {
  const ctx = ctxWithSessionLookup(() =>
    Promise.reject(new Error("Can't reach database server"))
  );

  await expect(
    resolveSession(ctx, cookieJar('some-token'), NO_HEADERS)
  ).rejects.toThrow("Can't reach database server");
});
