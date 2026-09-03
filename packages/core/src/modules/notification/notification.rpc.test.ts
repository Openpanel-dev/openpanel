// Only the "is anyone logged in" boundary is exercised here — no database.
// The access-check + CRUD logic ride on @openpanel/db (lazy-loaded, see
// notification.service.ts's header); wiring this router end-to-end against a
// real Postgres is P6's (protectedProcedure) job, not this one's — see
// notification.rpc.ts's header.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { notificationRouter } from './notification.rpc';

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
  return notificationRouter.createCaller(trpcCtx);
}

test('list rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(caller.list({ projectId: 'proj_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('rules rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(caller.rules({ projectId: 'proj_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('createOrUpdateRule rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(
    caller.createOrUpdateRule({
      name: 'Rule',
      config: { type: 'events', events: [] },
      integrations: [],
      sendToApp: true,
      sendToEmail: false,
      projectId: 'proj_1',
    })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('deleteRule rejects an unauthenticated caller before looking up the rule', async () => {
  const caller = await anonCaller();
  await expect(caller.deleteRule({ id: 'rule_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});
