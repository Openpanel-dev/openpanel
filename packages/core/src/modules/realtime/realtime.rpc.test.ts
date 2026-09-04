// Only the "is anyone logged in" boundary is exercised here — no database.
// The access-check + query bodies ride on @openpanel/db (lazy-loaded, see
// realtime.service.ts's header); wiring this router end-to-end against a
// real ClickHouse is P6's (protectedProcedure) job, not this one's — see
// realtime.rpc.ts's header. Same shape as cohort.rpc.test.ts.

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

// EMPTY_SESSION's shape (packages/db/src/services/auth-session.service.ts) —
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

test('paths rejects an unauthenticated caller before querying ClickHouse', async () => {
  const caller = await anonCaller();
  await expect(caller.paths({ projectId: 'proj_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('referrals rejects an unauthenticated caller before querying ClickHouse', async () => {
  const caller = await anonCaller();
  await expect(caller.referrals({ projectId: 'proj_1' })).rejects.toMatchObject(
    { code: 'UNAUTHORIZED' }
  );
});

test('geo rejects an unauthenticated caller before querying ClickHouse', async () => {
  const caller = await anonCaller();
  await expect(caller.geo({ projectId: 'proj_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});
