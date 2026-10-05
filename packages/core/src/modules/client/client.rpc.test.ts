// Only the "is anyone logged in" boundary is exercised here; no database. `list` has
// no access check of its own, so it is not exercised either.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { clientRouter } from './client.rpc';

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
  return clientRouter.createCaller(trpcCtx);
}

test('update rejects an unauthenticated caller before touching a client', async () => {
  const caller = await anonCaller();
  await expect(
    caller.update({ id: 'client_1', name: 'Renamed' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('create rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(
    caller.create({
      name: 'A client',
      projectId: 'proj_1',
      organizationId: 'org_1',
    })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('remove rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(caller.remove({ id: 'client_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});
