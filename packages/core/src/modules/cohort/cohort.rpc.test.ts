// Only the "is anyone logged in" boundary is exercised here — no database.
// The access-check + business logic ride on @openpanel/db (lazy-loaded, see
// cohort.service.ts's header) and ctx.services.cohort; wiring this router
// end-to-end against a real Postgres is P6's (protectedProcedure) job, not
// this one's — see cohort.rpc.ts's header.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { cohortRouter } from './cohort.rpc';

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
  return cohortRouter.createCaller(trpcCtx);
}

test('list rejects an unauthenticated caller before touching a project', async () => {
  const caller = await anonCaller();
  await expect(caller.list({ projectId: 'proj_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('get rejects an unauthenticated caller before reading a cohort', async () => {
  const caller = await anonCaller();
  await expect(caller.get({ id: 'cohort_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('create rejects an unauthenticated caller before writing a cohort', async () => {
  const caller = await anonCaller();
  await expect(
    caller.create({
      name: 'Power users',
      projectId: 'proj_1',
      definition: {
        type: 'event',
        criteria: {
          operator: 'and',
          events: [
            {
              name: 'purchase',
              filters: [],
              timeframe: { type: 'relative', value: '30d' },
            },
          ],
        },
      },
    })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('update rejects an unauthenticated caller before writing a cohort', async () => {
  const caller = await anonCaller();
  await expect(
    caller.update({ id: 'cohort_1', name: 'Renamed' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('delete rejects an unauthenticated caller before deleting a cohort', async () => {
  const caller = await anonCaller();
  await expect(caller.delete({ id: 'cohort_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('listProfiles rejects an unauthenticated caller before reading membership', async () => {
  const caller = await anonCaller();
  await expect(
    caller.listProfiles({
      projectId: 'proj_1',
      cohortId: 'cohort_1',
      take: 50,
    })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('getCount rejects an unauthenticated caller before counting membership', async () => {
  const caller = await anonCaller();
  await expect(caller.getCount({ cohortId: 'cohort_1' })).rejects.toMatchObject(
    { code: 'UNAUTHORIZED' }
  );
});

test('preview rejects an unauthenticated caller before computing a sample', async () => {
  const caller = await anonCaller();
  await expect(
    caller.preview({
      projectId: 'proj_1',
      definition: {
        type: 'event',
        criteria: {
          operator: 'and',
          events: [
            {
              name: 'purchase',
              filters: [],
              timeframe: { type: 'relative', value: '30d' },
            },
          ],
        },
      },
    })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('exportProfiles rejects an unauthenticated caller before reading membership', async () => {
  const caller = await anonCaller();
  await expect(
    caller.exportProfiles({ cohortId: 'cohort_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('refresh rejects an unauthenticated caller before enqueueing a recompute', async () => {
  const caller = await anonCaller();
  await expect(caller.refresh({ cohortId: 'cohort_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});
