// Only the "is anyone logged in" boundary and the token check (which never
// touches a database) are exercised here.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { zUpdateEmailPreferences } from './email.constants';
import { emailRouter } from './email.rpc';

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
  return emailRouter.createCaller(trpcCtx);
}

test('getPreferences rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(caller.getPreferences()).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('updatePreferences rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(
    caller.updatePreferences({ categories: { onboarding: false } })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('unsubscribe rejects an invalid token before touching the database', async () => {
  const caller = await anonCaller();
  await expect(
    caller.unsubscribe({
      email: 'a@example.com',
      category: 'onboarding',
      token: 'not-a-real-token',
    })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

// `updatePreferences` once took `z.record(z.string(), z.boolean())`, so an
// unknown key was written to `emailUnsubscribe` where nothing reads it. An
// enum-keyed `z.record` is EXHAUSTIVE in zod 4 and rejected a single real
// toggle, which is what the form sends. These pin both halves.
test('updatePreferences accepts a subset of real categories', () => {
  expect(
    zUpdateEmailPreferences.safeParse({ categories: { weekly_digest: true } })
      .success
  ).toBe(true);
  expect(
    zUpdateEmailPreferences.safeParse({
      categories: { weekly_digest: true, onboarding: false },
    }).success
  ).toBe(true);
});

test('updatePreferences refuses a category that does not exist', () => {
  expect(
    zUpdateEmailPreferences.safeParse({
      categories: { not_a_real_category: false },
    }).success
  ).toBe(false);
});
