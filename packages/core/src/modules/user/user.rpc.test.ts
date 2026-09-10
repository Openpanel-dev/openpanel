// Only the "is anyone logged in" boundary is exercised here — no database.
// Wiring this router end-to-end against a real Postgres is a separate
// concern from `protectedProcedure`'s auth guard, which is what these
// tests cover.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { userRouter } from './user.rpc';

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
  return userRouter.createCaller(trpcCtx);
}

test('deletionBlockers rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(caller.deletionBlockers()).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('delete rejects an unauthenticated caller before touching the account', async () => {
  const caller = await anonCaller();
  await expect(caller.delete()).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('update rejects an unauthenticated caller before touching the profile', async () => {
  const caller = await anonCaller();
  await expect(
    caller.update({ firstName: 'Ralph', lastName: 'Wiggum' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
