// Only the "is anyone logged in" boundary is exercised here, with no database.

import { expect, test } from 'bun:test';
import { testCoreConfig } from '../../../test/config-fixture';
import { stubHttpCtx, TEST_SESSION } from '../../../test/rpc-fixtures';
import type { HttpCtx } from '../../context';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { MAX_ID } from '../../shared/limits.constants';
import { authRouter } from './auth.rpc';

const COOKIE_OPTIONS: CookieOptions = {
  domain: '.openpanel.dev',
  secure: true,
  sameSite: 'lax',
  httpOnly: true,
  path: '/',
};

// `TrpcContext.session` is never literally `null`, only its `userId` is.
const EMPTY_SESSION = { session: null, user: null, userId: null };

async function anonCaller(
  config = testCoreConfig(),
  db: Partial<HttpCtx['db']> = {}
) {
  const { ctx } = stubHttpCtx(
    { config, db: db as HttpCtx['db'] },
    EMPTY_SESSION
  );
  const trpcCtx = await makeTrpcContext(ctx, new Headers(), {
    cookieOptions: COOKIE_OPTIONS,
  });
  return authRouter.createCaller(trpcCtx);
}

test('providers reports which OAuth features are configured, as booleans only', async () => {
  const anon = await anonCaller();
  expect(await anon.providers()).toEqual({
    google: false,
    github: false,
    gsc: false,
    devLogin: false,
  });

  const config = testCoreConfig();
  config.auth.google = {
    clientId: 'google-id',
    clientSecret: 'google-secret',
    redirectUri: 'https://api.example.com/oauth/google/callback',
  };
  config.auth.googleGsc = {
    ...config.auth.google,
    redirectUri: 'https://api.example.com/gsc/callback',
  };
  // A GitHub client id without its redirect URI cannot complete a sign-in.
  config.auth.github = {
    clientId: 'github-id',
    clientSecret: 'github-secret',
    redirectUri: '',
  };
  const { ctx } = stubHttpCtx({ config }, EMPTY_SESSION);
  const trpcCtx = await makeTrpcContext(ctx, new Headers(), {
    cookieOptions: COOKIE_OPTIONS,
  });
  const providers = await authRouter.createCaller(trpcCtx).providers();
  expect(providers).toEqual({
    google: true,
    github: false,
    gsc: true,
    devLogin: false,
  });
  expect(JSON.stringify(providers)).not.toContain('secret');
});

test('incomplete OAuth credentials hide the provider', async () => {
  for (const provider of ['github', 'google'] as const) {
    for (const missing of [
      'clientId',
      'clientSecret',
      'redirectUri',
    ] as const) {
      const config = testCoreConfig();
      config.auth[provider] = {
        clientId: 'fixture-id',
        clientSecret: 'fixture-secret',
        redirectUri: `https://api.example.com/oauth/${provider}/callback`,
      };
      config.auth[provider][missing] = '';
      expect((await (await anonCaller(config)).providers())[provider]).toBe(
        false
      );
    }
  }
});

test('Search Console can remain configured while Google sign-in is hidden', async () => {
  const config = testCoreConfig();
  config.auth.google = {
    clientId: 'google-id',
    clientSecret: 'google-secret',
    redirectUri: '',
  };
  config.auth.googleGsc = {
    ...config.auth.google,
    redirectUri: 'https://api.example.com/gsc/callback',
  };
  expect(await (await anonCaller(config)).providers()).toEqual({
    google: false,
    github: false,
    gsc: true,
    devLogin: false,
  });
  config.auth.googleGsc.clientSecret = '';
  expect((await (await anonCaller(config)).providers()).gsc).toBe(false);
});

test('providers says a dev login exists without reporting its credentials', async () => {
  const config = testCoreConfig();
  config.auth.devLogin = { email: 'admin@openpanel.local', password: 'pw' };
  const { ctx } = stubHttpCtx({ config }, EMPTY_SESSION);
  const trpcCtx = await makeTrpcContext(ctx, new Headers(), {
    cookieOptions: COOKIE_OPTIONS,
  });
  const providers = await authRouter.createCaller(trpcCtx).providers();
  expect(providers.devLogin).toBe(true);
  expect(JSON.stringify(providers)).not.toContain('openpanel.local');
  expect(JSON.stringify(providers)).not.toContain('pw');
});

test('signInDev is refused when DEV_LOGIN is not configured', async () => {
  const caller = await anonCaller();
  await expect(caller.signInDev({})).rejects.toMatchObject({
    code: 'BAD_REQUEST',
    message: 'Dev login is not configured on this deployment',
  });
});

test('twoFactorStatus rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(caller.twoFactorStatus()).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('session returns the caller session unauthenticated (no login required)', async () => {
  const caller = await anonCaller();
  await expect(caller.session()).resolves.toEqual(EMPTY_SESSION);
});

test('session never hands the session token to the browser', async () => {
  const signedIn = {
    ...TEST_SESSION,
    session: { ...TEST_SESSION.session, token: 'cookie-value' },
  };
  const { ctx } = stubHttpCtx({}, signedIn);
  const trpcCtx = await makeTrpcContext(ctx, new Headers(), {
    cookieOptions: COOKIE_OPTIONS,
  });
  const result = await authRouter.createCaller(trpcCtx).session();
  expect(result.userId).toBe(TEST_SESSION.userId);
  expect(JSON.stringify(result)).not.toContain('cookie-value');
});

function closedRegistration() {
  const base = testCoreConfig();
  return testCoreConfig({ auth: { ...base.auth, allowRegistration: false } });
}

function registrationDb(hasUsers: boolean, inviteExpiresAt?: Date) {
  return {
    user: { findFirst: async () => (hasUsers ? { id: 'user_1' } : null) },
    invite: {
      findUnique: async () =>
        inviteExpiresAt ? { expiresAt: inviteExpiresAt } : null,
    },
  } as unknown as Partial<HttpCtx['db']>;
}

test('registrationAllowed is open when ALLOW_REGISTRATION is unset', async () => {
  const anon = await anonCaller();
  expect(await anon.registrationAllowed({})).toBe(true);
});

test('registrationAllowed is closed to a visitor without an invite', async () => {
  const anon = await anonCaller(closedRegistration(), registrationDb(true));
  expect(await anon.registrationAllowed({})).toBe(false);
});

test('registrationAllowed stays open for the first user', async () => {
  const anon = await anonCaller(closedRegistration(), registrationDb(false));
  expect(await anon.registrationAllowed({})).toBe(true);
});

test('registrationAllowed opens for a live invite only', async () => {
  const HOUR_MS = 60 * 60 * 1000;
  const live = await anonCaller(
    closedRegistration(),
    registrationDb(true, new Date(Date.now() + HOUR_MS))
  );
  const expired = await anonCaller(
    closedRegistration(),
    registrationDb(true, new Date(Date.now() - HOUR_MS))
  );
  const unknown = await anonCaller(closedRegistration(), registrationDb(true));

  expect(await live.registrationAllowed({ inviteId: 'inv_1' })).toBe(true);
  expect(await expired.registrationAllowed({ inviteId: 'inv_1' })).toBe(false);
  expect(await unknown.registrationAllowed({ inviteId: 'inv_1' })).toBe(false);
});

test('registrationAllowed answers no to a mangled invite id', async () => {
  const anon = await anonCaller(closedRegistration(), registrationDb(true));
  const mangledInviteId = 'x'.repeat(MAX_ID + 1);
  expect(await anon.registrationAllowed({ inviteId: mangledInviteId })).toBe(
    false
  );
});
