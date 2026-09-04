// Only the "is anyone logged in" boundary is exercised here — no database.
// The access-check + query bodies ride on @openpanel/db (lazy-loaded, see
// group.service.ts's header); wiring this router end-to-end against a real
// ClickHouse is P6's (protectedProcedure) job — see group.rpc.ts's header.
// Same shape as session.rpc.test.ts.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { groupRouter } from './group.rpc';

const COOKIE_OPTIONS: CookieOptions = {
  domain: '.openpanel.dev',
  secure: true,
  sameSite: 'lax',
  httpOnly: true,
  path: '/',
};

const EMPTY_SESSION = { session: null, user: null, userId: null };
const REF = { id: 'grp_1', projectId: 'proj_1' };

async function anonCaller() {
  const { ctx } = stubHttpCtx({}, EMPTY_SESSION);
  const trpcCtx = await makeTrpcContext(ctx, new Headers(), {
    cookieOptions: COOKIE_OPTIONS,
  });
  return groupRouter.createCaller(trpcCtx);
}

const UNAUTHORIZED = { code: 'UNAUTHORIZED' };

test('every query rejects an unauthenticated caller before touching a database', async () => {
  const caller = await anonCaller();
  await expect(caller.list({ projectId: 'proj_1' })).rejects.toMatchObject(
    UNAUTHORIZED
  );
  await expect(caller.byId(REF)).rejects.toMatchObject(UNAUTHORIZED);
  await expect(caller.types({ projectId: 'proj_1' })).rejects.toMatchObject(
    UNAUTHORIZED
  );
  await expect(caller.metrics(REF)).rejects.toMatchObject(UNAUTHORIZED);
  await expect(caller.activity(REF)).rejects.toMatchObject(UNAUTHORIZED);
  await expect(caller.memberGrowth(REF)).rejects.toMatchObject(UNAUTHORIZED);
  await expect(
    caller.listProfiles({ projectId: 'proj_1', groupId: 'grp_1' })
  ).rejects.toMatchObject(UNAUTHORIZED);
  await expect(caller.mostEvents(REF)).rejects.toMatchObject(UNAUTHORIZED);
  await expect(caller.popularRoutes(REF)).rejects.toMatchObject(UNAUTHORIZED);
  await expect(
    caller.properties({ projectId: 'proj_1' })
  ).rejects.toMatchObject(UNAUTHORIZED);
  await expect(
    caller.listByIds({ projectId: 'proj_1', ids: ['grp_1'] })
  ).rejects.toMatchObject(UNAUTHORIZED);
});

test('every mutation rejects an unauthenticated caller before touching a database', async () => {
  const caller = await anonCaller();
  await expect(
    caller.create({ ...REF, type: 'company', name: 'Acme', properties: {} })
  ).rejects.toMatchObject(UNAUTHORIZED);
  await expect(caller.update({ ...REF, name: 'Acme' })).rejects.toMatchObject(
    UNAUTHORIZED
  );
  await expect(caller.delete(REF)).rejects.toMatchObject(UNAUTHORIZED);
});

test('create rejects an id outside zGroupId at the input boundary', async () => {
  const caller = await anonCaller();
  await expect(
    caller.create({
      id: 'Not Valid',
      projectId: 'proj_1',
      type: 'company',
      name: 'Acme',
      properties: {},
    })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
