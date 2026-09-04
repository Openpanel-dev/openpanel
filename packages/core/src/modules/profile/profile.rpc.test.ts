// Only the "is anyone logged in" boundary is exercised here — no database.
// The access-check + query bodies ride on @openpanel/db (lazy-loaded, see
// profile.service.ts's header); wiring this router end-to-end against a real
// ClickHouse is P6's (protectedProcedure) job — see profile.rpc.ts's header.
// Same shape as session.rpc.test.ts.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { profileRouter } from './profile.rpc';

const COOKIE_OPTIONS: CookieOptions = {
  domain: '.openpanel.dev',
  secure: true,
  sameSite: 'lax',
  httpOnly: true,
  path: '/',
};

const EMPTY_SESSION = { session: null, user: null, userId: null };
const REF = { profileId: 'prof_1', projectId: 'proj_1' };

async function anonCaller() {
  const { ctx } = stubHttpCtx({}, EMPTY_SESSION);
  const trpcCtx = await makeTrpcContext(ctx, new Headers(), {
    cookieOptions: COOKIE_OPTIONS,
  });
  return profileRouter.createCaller(trpcCtx);
}

const UNAUTHORIZED = { code: 'UNAUTHORIZED' };

test('every procedure rejects an unauthenticated caller before touching a database', async () => {
  const caller = await anonCaller();
  await expect(caller.byId(REF)).rejects.toMatchObject(UNAUTHORIZED);
  await expect(caller.metrics(REF)).rejects.toMatchObject(UNAUTHORIZED);
  await expect(caller.activity(REF)).rejects.toMatchObject(UNAUTHORIZED);
  await expect(caller.mostEvents(REF)).rejects.toMatchObject(UNAUTHORIZED);
  await expect(caller.popularRoutes(REF)).rejects.toMatchObject(UNAUTHORIZED);
  await expect(
    caller.properties({ projectId: 'proj_1' })
  ).rejects.toMatchObject(UNAUTHORIZED);
  await expect(caller.list({ projectId: 'proj_1' })).rejects.toMatchObject(
    UNAUTHORIZED
  );
  await expect(
    caller.powerUsers({ projectId: 'proj_1' })
  ).rejects.toMatchObject(UNAUTHORIZED);
  await expect(
    caller.values({ projectId: 'proj_1', property: 'email' })
  ).rejects.toMatchObject(UNAUTHORIZED);
});

test('list rejects a malformed filter at the input boundary', async () => {
  const caller = await anonCaller();
  await expect(
    caller.list({ projectId: 'proj_1', filters: [{ bogus: true }] as never })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
