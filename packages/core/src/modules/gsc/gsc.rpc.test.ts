// Only the "is anyone logged in" boundary is exercised here, with no database.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { gscRouter } from './gsc.rpc';

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
  return gscRouter.createCaller(trpcCtx);
}

test('getConnection rejects an unauthenticated caller before touching a project', async () => {
  const caller = await anonCaller();
  await expect(
    caller.getConnection({ projectId: 'proj_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('initiateOAuth rejects an unauthenticated caller before minting state', async () => {
  const caller = await anonCaller();
  await expect(
    caller.initiateOAuth({ projectId: 'proj_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('getSites rejects an unauthenticated caller before calling Google', async () => {
  const caller = await anonCaller();
  await expect(caller.getSites({ projectId: 'proj_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('selectSite rejects an unauthenticated caller before writing a connection', async () => {
  const caller = await anonCaller();
  await expect(
    caller.selectSite({ projectId: 'proj_1', siteUrl: 'https://example.com' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('disconnect rejects an unauthenticated caller before deleting a connection', async () => {
  const caller = await anonCaller();
  await expect(
    caller.disconnect({ projectId: 'proj_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('getOverview rejects an unauthenticated caller before resolving a date range', async () => {
  const caller = await anonCaller();
  await expect(
    caller.getOverview({ projectId: 'proj_1', range: '30d' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
