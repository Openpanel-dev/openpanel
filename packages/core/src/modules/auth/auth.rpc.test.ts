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

async function anonCaller() {
  const { ctx } = stubHttpCtx({}, EMPTY_SESSION);
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
  expect(providers).toEqual({ google: true, github: false, gsc: true });
  expect(JSON.stringify(providers)).not.toContain('secret');
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
