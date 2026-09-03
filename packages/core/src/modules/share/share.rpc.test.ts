// Only the "is anyone logged in" boundary is exercised here — no database.
// The query/mutation bodies ride on @openpanel/db (lazy-loaded, see
// share.service.ts's header); wiring this router end-to-end against a real
// Postgres is P6's (protectedProcedure) job, not this one's — see
// share.rpc.ts's header.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { shareRouter } from './share.rpc';

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
