// Only the "is anyone logged in" boundary (+ the token check, which never
// touches a database) is exercised here. `unsubscribe`'s upsert and
// `getPreferences`/`updatePreferences`'s reads ride on @openpanel/db
// (lazy-loaded, see email.rpc.ts's header); wiring this router end-to-end
// against a real Postgres is P6's (protectedProcedure) job, not this one's.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
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
