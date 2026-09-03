// Only the "is anyone logged in" boundary is exercised here — no database.
// The access-check + CRUD logic ride on @openpanel/db (lazy-loaded, see
// reference.service.ts's header); wiring this router end-to-end against a
// real Postgres is P6's (protectedProcedure) job, not this one's — see
// reference.rpc.ts's header.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { referenceRouter } from './reference.rpc';

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
  return referenceRouter.createCaller(trpcCtx);
}

test('getReferences rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(
    caller.getReferences({ projectId: 'proj_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('create rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(
    caller.create({
      title: 'Launch',
      description: null,
      datetime: '2026-09-03T00:00:00.000Z',
      projectId: 'proj_1',
    })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('update rejects an unauthenticated caller before looking up the reference', async () => {
  const caller = await anonCaller();
  await expect(
    caller.update({
      id: 'ref_1',
      title: 'Launch',
      description: null,
      datetime: '2026-09-03T00:00:00.000Z',
    })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('delete rejects an unauthenticated caller before looking up the reference', async () => {
  const caller = await anonCaller();
  await expect(caller.delete({ id: 'ref_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});
