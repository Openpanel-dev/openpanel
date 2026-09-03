// Only the "is anyone logged in" boundary is exercised here — no database.
// The access-check + mutation bodies ride on @openpanel/db (lazy-loaded
// through ./src/access and project.service.ts); wiring this router
// end-to-end against a real Postgres is P6's (protectedProcedure) job, not
// this one's — see project.rpc.ts's header.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { projectRouter } from './project.rpc';

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
  return projectRouter.createCaller(trpcCtx);
}

test('getProjectWithClients rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(
    caller.getProjectWithClients({ projectId: 'proj_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('activationStatus rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(
    caller.activationStatus({ projectId: 'proj_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('list rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(caller.list({ organizationId: 'org_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('update rejects an unauthenticated caller before touching a project', async () => {
  const caller = await anonCaller();
  await expect(caller.update({ id: 'proj_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('create rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(
    caller.create({
      organizationId: 'org_1',
      project: 'My Project',
      domain: 'https://example.com',
      cors: [],
      website: true,
      app: false,
      backend: false,
    })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('delete rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(caller.delete({ projectId: 'proj_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('cancelDeletion rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(
    caller.cancelDeletion({ projectId: 'proj_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
