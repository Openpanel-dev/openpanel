import { expect, test } from 'bun:test';
import { stubAppDeps } from '../../test/http-fixtures';
import { type AppDeps, createCtx } from '../context';
import { hashSessionToken } from '../modules/auth/src/token';
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

test('with several session cookies the first that is signed in wins', async () => {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const user = { id: 'user_1', email: 'carl@openpanel.dev' };
  const liveId = hashSessionToken('live-token');
  const lookedUp: string[] = [];
  const ctx = ctxWithSessionLookup(((args: { where: { id: string } }) => {
    lookedUp.push(args.where.id);
    return Promise.resolve(
      args.where.id === liveId ? { id: liveId, expiresAt, user } : null
    );
  }) as () => Promise<unknown>);
  const headers = new Headers({
    cookie: `session=${encodeURIComponent('stale-token')}; other=1; session=${encodeURIComponent('live-token')}`,
  });

  const resolved = await resolveSession(ctx, cookieJar('stale-token'), headers);

  expect(resolved?.userId).toBe('user_1');
  expect(lookedUp).toEqual([hashSessionToken('stale-token'), liveId]);
});
