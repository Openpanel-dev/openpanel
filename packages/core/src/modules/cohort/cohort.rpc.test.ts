// Only the "is anyone logged in" boundary is exercised here, with no database.

import { expect, mock, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import { TRPCForbiddenError } from '../../rpc/errors';
import type { CookieOptions } from '../../shared/cookie';
import { cohortRouter } from './cohort.rpc';

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

// The project-access middleware and the handler both ask this ladder; a
// refusal from either must stop the write.
function nonMemberCaller(write: ReturnType<typeof mock>) {
  const requireProjectAccess = mock(() =>
    Promise.reject(
      new TRPCForbiddenError('You do not have access to this project')
    )
  );
  const { ctx } = stubHttpCtx(
    {
      services: {
        auth: { requireProjectAccess },
        cohort: { enqueueCompute: write },
      },
    } as unknown as Parameters<typeof stubHttpCtx>[0],
    { session: {}, user: {}, userId: 'user_outsider' }
  );
  return {
    requireProjectAccess,
    caller: async () =>
      cohortRouter.createCaller(
        await makeTrpcContext(ctx, new Headers(), {
          cookieOptions: COOKIE_OPTIONS,
        })
      ),
  };
}

test('create refuses a signed-in user without write access to the project', async () => {
  const enqueueCompute = mock(() => Promise.resolve());
  const t = nonMemberCaller(enqueueCompute);
  const caller = await t.caller();

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
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(t.requireProjectAccess).toHaveBeenCalledWith({
    userId: 'user_outsider',
    projectId: 'proj_1',
    level: 'write',
  });
  expect(enqueueCompute).not.toHaveBeenCalled();
});
