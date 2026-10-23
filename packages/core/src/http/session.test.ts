import { expect, test } from 'bun:test';
import { testCoreConfig } from '../../test/config-fixture';
import { stubAppDeps } from '../../test/http-fixtures';
import { type AppDeps, createCtx } from '../context';
import {
  AUTH_SESSION_COOKIE,
  type Auth,
} from '../modules/auth/src/better-auth';
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

function request(cookies: ReturnType<typeof cookieJar>, headers: Headers) {
  return { cookies, headers, setCookie: () => undefined };
}

test('a cookie that matches no session resolves to nobody signed in', async () => {
  const ctx = ctxWithSessionLookup(() => Promise.resolve(null));

  expect(
    await resolveSession(
      ctx,
      request(cookieJar('not-a-real-token'), NO_HEADERS)
    )
  ).toBeNull();
});

test('no cookie resolves to nobody signed in without touching the database', async () => {
  const ctx = ctxWithSessionLookup(() =>
    Promise.reject(new Error('should not be called'))
  );

  expect(
    await resolveSession(ctx, request(cookieJar(undefined), NO_HEADERS))
  ).toBeNull();
});

test('a failing session lookup propagates instead of signing the user out', async () => {
  const ctx = ctxWithSessionLookup(() =>
    Promise.reject(new Error("Can't reach database server"))
  );

  await expect(
    resolveSession(ctx, request(cookieJar('some-token'), NO_HEADERS))
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

  const resolved = await resolveSession(
    ctx,
    request(cookieJar('stale-token'), headers)
  );

  expect(resolved?.userId).toBe('user_1');
  expect(lookedUp).toEqual([hashSessionToken('stale-token'), liveId]);
});

const AUTH_SECRET = 'test-auth-secret-at-least-32-characters';
const FUTURE = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const USER = { id: 'user_1', email: 'carl@openpanel.dev' };

interface CapturedCookie {
  name: string;
  value: string;
}

function ctxWithAuth({
  auth,
  db,
  demoUserId,
}: {
  auth: unknown;
  db: unknown;
  demoUserId?: string;
}) {
  const { deps, logger } = stubAppDeps();
  const config = testCoreConfig({ demoUserId });
  config.auth.secret = AUTH_SECRET;
  return createCtx(
    {
      ...deps,
      config,
      auth: auth as Auth,
      db: db as AppDeps['db'],
    },
    { requestId: 'req-1', logger }
  );
}

function capturingRequest(cookieHeader: string, legacyToken?: string) {
  const written: CapturedCookie[] = [];
  return {
    written,
    request: {
      cookies: cookieJar(legacyToken),
      headers: new Headers({ cookie: cookieHeader }),
      setCookie: (name: string, value: string) => {
        written.push({ name, value });
      },
    },
  };
}

test("better-auth's cookie resolves the session without the legacy lookup", async () => {
  const session = { id: 'sess_ba', token: 'ba-token', userId: USER.id };
  const auth = {
    api: {
      getSession: () =>
        Promise.resolve({
          headers: new Headers(),
          response: {
            session,
            user: { ...USER, name: '', emailVerified: false },
          },
        }),
    },
  };
  const db = {
    session: {
      findUnique: () => Promise.reject(new Error('legacy lookup not expected')),
    },
  };
  const ctx = ctxWithAuth({ auth, db });
  const { request } = capturingRequest(
    `${AUTH_SESSION_COOKIE}=ba-token.sig; session=legacy`,
    'legacy'
  );

  const resolved = await resolveSession(ctx, request);

  expect(resolved?.userId).toBe(USER.id);
  expect(resolved?.session?.id).toBe('sess_ba');
});

test("a legacy session is resolved and handed better-auth's cookie on its row", async () => {
  const token = 'legacy-token';
  const id = hashSessionToken(token);
  const tokenWrites: unknown[] = [];
  const auth = {
    api: {
      getSession: () => Promise.reject(new Error('no better-auth cookie sent')),
    },
  };
  const db = {
    session: {
      findUnique: () =>
        Promise.resolve({
          id,
          token: null,
          userId: USER.id,
          expiresAt: FUTURE(),
          user: USER,
        }),
      updateMany: (args: unknown) => {
        tokenWrites.push(args);
        return Promise.resolve({ count: 1 });
      },
    },
  };
  const ctx = ctxWithAuth({ auth, db });
  const { request, written } = capturingRequest(
    `session=${encodeURIComponent(token)}`,
    token
  );

  const resolved = await resolveSession(ctx, request);

  expect(resolved?.userId).toBe(USER.id);
  expect(tokenWrites).toEqual([
    { where: { id, token: null }, data: { token } },
  ]);
  const upgraded = written.find(
    (cookie) => cookie.name === AUTH_SESSION_COOKIE
  );
  expect(upgraded?.value.startsWith(`${token}.`)).toBe(true);
});

test('an already upgraded legacy row is not written again', async () => {
  const token = 'legacy-token';
  const auth = { api: { getSession: () => Promise.resolve(null) } };
  const db = {
    session: {
      findUnique: () =>
        Promise.resolve({
          id: hashSessionToken(token),
          token,
          userId: USER.id,
          expiresAt: FUTURE(),
          user: USER,
        }),
      updateMany: () => Promise.reject(new Error('should not be called')),
    },
  };
  const ctx = ctxWithAuth({ auth, db });
  const { request, written } = capturingRequest(
    `session=${encodeURIComponent(token)}`,
    token
  );

  expect((await resolveSession(ctx, request))?.userId).toBe(USER.id);
  expect(written.map((cookie) => cookie.name)).toEqual([AUTH_SESSION_COOKIE]);
});

test('the demo user wins over any cookie', async () => {
  const auth = {
    api: {
      getSession: () => Promise.reject(new Error('should not be called')),
    },
  };
  const db = {
    user: { findUniqueOrThrow: () => Promise.resolve({ ...USER, id: 'demo' }) },
  };
  const ctx = ctxWithAuth({ auth, db, demoUserId: 'demo' });
  const { request } = capturingRequest(`${AUTH_SESSION_COOKIE}=x.y`);

  expect((await resolveSession(ctx, request))?.userId).toBe('demo');
});
