// Only the "is anyone logged in" boundary is exercised here — no database.
// The sign-up/sign-in/reset-password/share bodies ride on @openpanel/db
// (lazy-loaded through ./auth.service); wiring this router end-to-end
// against a real Postgres is P6's (protectedProcedure) job, not this one's —
// see auth.rpc.ts's header.

import { expect, test } from 'bun:test';
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

// EMPTY_SESSION's shape (./src/login-session.ts) — `TrpcContext.session` is
// never literally `null`, only its `userId` is.
const EMPTY_SESSION = { session: null, user: null, userId: null };

async function anonCaller() {
  const { ctx } = stubHttpCtx({}, EMPTY_SESSION);
  const trpcCtx = await makeTrpcContext(ctx, new Headers(), {
    cookieOptions: COOKIE_OPTIONS,
  });
  return authRouter.createCaller(trpcCtx);
}

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
