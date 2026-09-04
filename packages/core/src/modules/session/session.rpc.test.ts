// Only the "is anyone logged in" boundary is exercised here — no database.
// The access-check + query bodies ride on @openpanel/db (lazy-loaded, see
// session.service.ts's header); wiring this router end-to-end against a real
// ClickHouse is P6's (protectedProcedure) job — see session.rpc.ts's header.
// Same shape as realtime.rpc.test.ts.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { sessionRouter } from './session.rpc';

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
  return sessionRouter.createCaller(trpcCtx);
}

test('list rejects an unauthenticated caller before querying ClickHouse', async () => {
  const caller = await anonCaller();
  await expect(caller.list({ projectId: 'proj_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('distinctValues rejects an unauthenticated caller before querying ClickHouse', async () => {
  const caller = await anonCaller();
  await expect(
    caller.distinctValues({ projectId: 'proj_1', field: 'country' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('distinctValues rejects a field outside SESSION_DISTINCT_FIELDS at the input boundary', async () => {
  const caller = await anonCaller();
  await expect(
    caller.distinctValues({
      projectId: 'proj_1',
      field: 'profile_id' as never,
    })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

test('byId rejects an unauthenticated caller before querying ClickHouse', async () => {
  const caller = await anonCaller();
  await expect(
    caller.byId({ projectId: 'proj_1', sessionId: 'sess_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('replayChunksFrom rejects an unauthenticated caller before querying ClickHouse', async () => {
  const caller = await anonCaller();
  await expect(
    caller.replayChunksFrom({ projectId: 'proj_1', sessionId: 'sess_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
