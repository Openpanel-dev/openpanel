// Only the "is anyone logged in" boundary is exercised here — no database.
// The access-check + query bodies ride on @openpanel/db (lazy-loaded, see
// event.service.ts's header); wiring this router end-to-end against a real
// ClickHouse is P6's (protectedProcedure) job — see event.rpc.ts's header.
// Same shape as session.rpc.test.ts.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { eventRouter } from './event.rpc';

const COOKIE_OPTIONS: CookieOptions = {
  domain: '.openpanel.dev',
  secure: true,
  sameSite: 'lax',
  httpOnly: true,
  path: '/',
};

const EMPTY_SESSION = { session: null, user: null, userId: null };
const PROJECT = { projectId: 'proj_1' };
const REF = { id: 'evt_1', projectId: 'proj_1' };
const WINDOW = { projectId: 'proj_1', range: '7d', interval: 'day' } as const;

async function anonCaller() {
  const { ctx } = stubHttpCtx({}, EMPTY_SESSION);
  const trpcCtx = await makeTrpcContext(ctx, new Headers(), {
    cookieOptions: COOKIE_OPTIONS,
  });
  return eventRouter.createCaller(trpcCtx);
}

const UNAUTHORIZED = { code: 'UNAUTHORIZED' };

test('every query rejects an unauthenticated caller before touching a database', async () => {
  const caller = await anonCaller();
  await expect(caller.byId(REF)).rejects.toMatchObject(UNAUTHORIZED);
  await expect(caller.details(REF)).rejects.toMatchObject(UNAUTHORIZED);
  await expect(caller.events(PROJECT)).rejects.toMatchObject(UNAUTHORIZED);
  await expect(caller.conversionNames(PROJECT)).rejects.toMatchObject(
    UNAUTHORIZED
  );
  await expect(caller.conversions(PROJECT)).rejects.toMatchObject(UNAUTHORIZED);
  await expect(caller.pages(WINDOW)).rejects.toMatchObject(UNAUTHORIZED);
  await expect(caller.pagesTimeseries(WINDOW)).rejects.toMatchObject(
    UNAUTHORIZED
  );
  await expect(caller.previousPages(WINDOW)).rejects.toMatchObject(
    UNAUTHORIZED
  );
  await expect(
    caller.pageTimeseries({ ...WINDOW, origin: 'https://a.io', path: '/' })
  ).rejects.toMatchObject(UNAUTHORIZED);
  await expect(caller.origin(PROJECT)).rejects.toMatchObject(UNAUTHORIZED);
});

// V1 let anonymous callers in on the mere existence of a ShareOverview row;
// ADR-011 §9 rules that a bug.
test('bots rejects an unauthenticated caller (ADR-011: no anonymous share branch)', async () => {
  const caller = await anonCaller();
  await expect(caller.bots(PROJECT)).rejects.toMatchObject(UNAUTHORIZED);
});

test('updateEventMeta rejects an unauthenticated caller before touching Postgres', async () => {
  const caller = await anonCaller();
  await expect(
    caller.updateEventMeta({ ...PROJECT, name: 'signup', conversion: true })
  ).rejects.toMatchObject(UNAUTHORIZED);
});

test('events rejects a malformed filter at the input boundary', async () => {
  const caller = await anonCaller();
  await expect(
    caller.events({ ...PROJECT, filters: [{ bogus: true }] as never })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
