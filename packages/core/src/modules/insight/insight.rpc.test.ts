// Only the "is anyone logged in" boundary is exercised here — no database.
// list/listAll/explain's actual access-check + business logic ride on
// @openpanel/db (lazy-loaded, see insight.service.ts's header) and are
// covered at the unit level in insight.service.test.ts; wiring this router
// end-to-end against a real Postgres is P6's (protectedProcedure) job, not
// this one's — see insight.rpc.ts's header.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { insightRouter } from './insight.rpc';

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
  return insightRouter.createCaller(trpcCtx);
}

test('list rejects an unauthenticated caller before touching a project', async () => {
  const caller = await anonCaller();
  await expect(caller.list({ projectId: 'proj_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('listAll rejects an unauthenticated caller before touching a project', async () => {
  const caller = await anonCaller();
  await expect(caller.listAll({ projectId: 'proj_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('explain rejects an unauthenticated caller before reading an insight', async () => {
  const caller = await anonCaller();
  await expect(
    caller.explain({ insightId: 'insight_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
