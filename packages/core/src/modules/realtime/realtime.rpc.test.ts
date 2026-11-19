// Only the "is anyone logged in" boundary is exercised here; no database.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { realtimeRouter } from './realtime.rpc';

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
  return realtimeRouter.createCaller(trpcCtx);
}

test('coordinates rejects an unauthenticated caller before querying ClickHouse', async () => {
  const caller = await anonCaller();
  await expect(
    caller.coordinates({ projectId: 'proj_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('mapBadgeDetails rejects an unauthenticated caller before querying ClickHouse', async () => {
  const caller = await anonCaller();
  await expect(
    caller.mapBadgeDetails({
      projectId: 'proj_1',
      detailScope: 'country',
      locations: [{ country: 'SE' }],
    })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('activeSessions rejects an unauthenticated caller before querying ClickHouse', async () => {
  const caller = await anonCaller();
  await expect(
    caller.activeSessions({ projectId: 'proj_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('recentSessions rejects an unauthenticated caller before querying ClickHouse', async () => {
  const caller = await anonCaller();
  await expect(
    caller.recentSessions({ projectId: 'proj_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('topSources rejects an unauthenticated caller before querying ClickHouse', async () => {
  const caller = await anonCaller();
  await expect(
    caller.topSources({ projectId: 'proj_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('histogram rejects an unauthenticated caller before querying ClickHouse', async () => {
  const caller = await anonCaller();
  await expect(caller.histogram({ projectId: 'proj_1' })).rejects.toMatchObject(
    { code: 'UNAUTHORIZED' }
  );
});
