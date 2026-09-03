// Only the "is anyone logged in" boundary is exercised here — no database.
// The admin-access-check + mutation bodies ride on @openpanel/db (lazy-loaded
// through ./src/access and organization.service.ts); wiring this router
// end-to-end against a real Postgres is P6's (protectedProcedure) job, not
// this one's — see organization.rpc.ts's header.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { organizationRouter } from './organization.rpc';

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
  return organizationRouter.createCaller(trpcCtx);
}

test('get rejects an unauthenticated caller before reading an organization', async () => {
  const caller = await anonCaller();
  await expect(caller.get({ organizationId: 'org_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('list rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(caller.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('myAccess rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(
    caller.myAccess({ organizationId: 'org_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('update rejects an unauthenticated caller before touching an organization', async () => {
  const caller = await anonCaller();
  await expect(
    caller.update({ id: 'org_1', name: 'Acme', timezone: 'UTC' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('delete rejects an unauthenticated caller before scheduling deletion', async () => {
  const caller = await anonCaller();
  await expect(
    caller.delete({ organizationId: 'org_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('inviteUser rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(
    caller.inviteUser({
      organizationId: 'org_1',
      email: 'a@example.com',
      role: 'org:member',
      access: [],
    })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('removeMember rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(
    caller.removeMember({
      organizationId: 'org_1',
      userId: 'user_2',
      id: 'member_1',
    })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('members rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(
    caller.members({ organizationId: 'org_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('getInvite requires an inviteId', async () => {
  const caller = await anonCaller();
  await expect(caller.getInvite({})).rejects.toMatchObject({
    code: 'BAD_REQUEST',
  });
});
