// Only the "is anyone logged in" boundary is exercised here; no database.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { conversationRouter } from './conversation.rpc';

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
  return conversationRouter.createCaller(trpcCtx);
}

test('list rejects an unauthenticated caller before touching a project', async () => {
  const caller = await anonCaller();
  await expect(caller.list({ projectId: 'proj_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('get rejects an unauthenticated caller before reading a conversation', async () => {
  const caller = await anonCaller();
  await expect(caller.get({ id: 'conv_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('rename rejects an unauthenticated caller before touching a conversation', async () => {
  const caller = await anonCaller();
  await expect(
    caller.rename({ id: 'conv_1', title: 'New title', projectId: 'proj_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('delete rejects an unauthenticated caller before deleting a conversation', async () => {
  const caller = await anonCaller();
  await expect(caller.delete({ id: 'conv_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});
