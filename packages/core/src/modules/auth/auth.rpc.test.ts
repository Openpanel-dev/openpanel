// Only the "is anyone logged in" boundary is exercised here, with no database.

import { expect, test } from 'bun:test';
import { testCoreConfig } from '../../../test/config-fixture';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
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

/** Capture response cookies so failed sign-ins cannot silently mutate auth state. */
async function anonCallerWithHeaders(config = testCoreConfig()) {
  const { ctx } = stubHttpCtx({ config }, EMPTY_SESSION);
  const responseHeaders = new Headers();
  const trpcCtx = await makeTrpcContext(ctx, responseHeaders, {
    cookieOptions: COOKIE_OPTIONS,
  });
  return { caller: authRouter.createCaller(trpcCtx), responseHeaders };
}

/** Use the same anonymous context for RPC cases that do not inspect cookies. */
async function anonCaller(config = testCoreConfig()) {
  return (await anonCallerWithHeaders(config)).caller;
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

test('incomplete OAuth credentials hide the provider and reject sign-in', async () => {
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
      const { caller, responseHeaders } = await anonCallerWithHeaders(config);
      expect((await caller.providers())[provider]).toBe(false);
      await expect(caller.signInOAuth({ provider })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      expect(responseHeaders.getSetCookie()).toEqual([]);
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

test('totpStatus rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(caller.totpStatus()).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('totpSetup rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(caller.totpSetup()).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('totpEnable rejects an unauthenticated caller before checking a code', async () => {
  const caller = await anonCaller();
  await expect(caller.totpEnable({ code: '123456' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('totpDisable rejects an unauthenticated caller before checking a code', async () => {
  const caller = await anonCaller();
  await expect(caller.totpDisable({ code: '123456' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('totpRegenerateRecoveryCodes rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(
    caller.totpRegenerateRecoveryCodes({ code: '123456' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('session returns the caller session unauthenticated (no login required)', async () => {
  const caller = await anonCaller();
  await expect(caller.session()).resolves.toEqual(EMPTY_SESSION);
});
