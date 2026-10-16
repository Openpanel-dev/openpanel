// Only the "is anyone logged in" boundary is exercised here, with no database.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { importRouter } from './import.rpc';

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
  return importRouter.createCaller(trpcCtx);
}

test('list rejects an unauthenticated caller before touching a project', async () => {
  const caller = await anonCaller();
  await expect(caller.list({ projectId: 'proj_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('create rejects an unauthenticated caller before writing an import', async () => {
  const caller = await anonCaller();
  await expect(
    caller.create({
      projectId: 'proj_1',
      provider: 'umami',
      config: {
        provider: 'umami',
        type: 'file',
        fileUrl: 'https://example.com/export.csv',
        projectMapper: [],
      },
    })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('delete rejects an unauthenticated caller before removing an import', async () => {
  const caller = await anonCaller();
  await expect(caller.delete({ id: 'imp_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('retry rejects an unauthenticated caller before re-enqueuing', async () => {
  const caller = await anonCaller();
  await expect(caller.retry({ id: 'imp_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});
