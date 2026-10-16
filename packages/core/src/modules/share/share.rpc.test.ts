// Only the "is anyone logged in" boundary is exercised here; no database.

import { expect, mock, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import { TRPCForbiddenError } from '../../rpc/errors';
import type { CookieOptions } from '../../shared/cookie';
import { shareRouter } from './share.rpc';

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
  return shareRouter.createCaller(trpcCtx);
}

test('overviewSettings rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(
    caller.overviewSettings({ projectId: 'proj_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('createOverview rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(
    caller.createOverview({
      organizationId: 'org_1',
      projectId: 'proj_1',
      public: true,
      password: null,
    })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('dashboardSettings rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(
    caller.dashboardSettings({ projectId: 'proj_1', dashboardId: 'dash_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('createDashboard rejects an unauthenticated caller before touching a project', async () => {
  const caller = await anonCaller();
  await expect(
    caller.createDashboard({
      organizationId: 'org_1',
      projectId: 'proj_1',
      dashboardId: 'dash_1',
      public: true,
      password: null,
    })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('reportSettings rejects an unauthenticated caller', async () => {
  const caller = await anonCaller();
  await expect(
    caller.reportSettings({ projectId: 'proj_1', reportId: 'report_1' })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('createReport rejects an unauthenticated caller before touching a project', async () => {
  const caller = await anonCaller();
  await expect(
    caller.createReport({
      organizationId: 'org_1',
      projectId: 'proj_1',
      reportId: 'report_1',
      public: true,
      password: null,
    })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
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
        share: { createShareOverview: write },
      },
    } as unknown as Parameters<typeof stubHttpCtx>[0],
    { session: {}, user: {}, userId: 'user_outsider' }
  );
  return {
    requireProjectAccess,
    caller: async () =>
      shareRouter.createCaller(
        await makeTrpcContext(ctx, new Headers(), {
          cookieOptions: COOKIE_OPTIONS,
        })
      ),
  };
}

test('createOverview refuses a signed-in user without write access to the project', async () => {
  const createShareOverview = mock(() => Promise.resolve({}));
  const t = nonMemberCaller(createShareOverview);
  const caller = await t.caller();

  await expect(
    caller.createOverview({
      organizationId: 'org_1',
      projectId: 'proj_1',
      public: true,
      password: null,
    })
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(t.requireProjectAccess).toHaveBeenCalledWith({
    userId: 'user_outsider',
    projectId: 'proj_1',
    level: 'write',
  });
  expect(createShareOverview).not.toHaveBeenCalled();
});
