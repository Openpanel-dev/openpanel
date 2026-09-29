// Only the "is anyone logged in" boundary (+ the token check, which never
// touches a database) is exercised here. `unsubscribe`'s upsert and
// `getPreferences`/`updatePreferences`'s reads ride on @openpanel/db
// (lazy-loaded, see email.rpc.ts's header); wiring this router end-to-end
// against a real Postgres is P6's (protectedProcedure) job, not this one's.

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

// EMPTY_SESSION's shape (packages/db/src/services/auth-session.service.ts) —
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

// `updatePreferences` used to take `z.record(z.string(), z.boolean())`, so an
// unknown key was written to `emailUnsubscribe` where nothing reads it. The
// first cut of the fix used `z.record(z.enum(...))`, which in zod 4 is
// EXHAUSTIVE — it rejected a single real toggle, which is what the form sends.
// These pin both halves so that trap cannot come back.
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
