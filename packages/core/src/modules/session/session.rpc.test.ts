// Only the "is anyone logged in" boundary is exercised here; no database.

import { expect, test } from 'bun:test';
import {
  servicesWithProjectAccess,
  stubHttpCtx,
} from '../../../test/rpc-fixtures';
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

// `TrpcContext.session` is never literally `null`, only its `userId` is.
const EMPTY_SESSION = { session: null, user: null, userId: null };

async function anonCaller() {
  const { ctx } = stubHttpCtx({}, EMPTY_SESSION);
  const trpcCtx = await makeTrpcContext(ctx, new Headers(), {
    cookieOptions: COOKIE_OPTIONS,
  });
  return sessionRouter.createCaller(trpcCtx);
}

/**
 * A signed-in member. `protectedProcedure` authenticates and authorizes
 * before the input parser runs, so reaching a zod rejection needs both.
 */
async function memberCaller() {
  const { ctx } = stubHttpCtx({ services: servicesWithProjectAccess() });
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

test('replayChunksFrom rejects a negative fromIndex at the input boundary', async () => {
  const caller = await memberCaller();
  await expect(
    caller.replayChunksFrom({
      projectId: 'proj_1',
      sessionId: 'sess_1',
      fromIndex: -1,
    })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
