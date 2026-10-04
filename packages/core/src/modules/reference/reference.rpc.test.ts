// Only the "is anyone logged in" boundary is exercised here — no database.
// The access-check + CRUD logic ride on @openpanel/db (lazy-loaded, see
// reference.service.ts's header); wiring this router end-to-end against a
// real Postgres is P6's (protectedProcedure) job, not this one's — see
// reference.rpc.ts's header.

import { expect, mock, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import { TRPCForbiddenError } from '../../rpc/errors';
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

const CHART_INPUT = { projectId: 'proj_1', range: '30d' as const };
const ANNOTATIONS = [{ title: 'Deploy v2' }];

function guardCaller(options: {
  userId: string | null;
  projectAccess?: unknown;
  anonymousShareAccess?: boolean;
}) {
  const getChartReferences = mock(() => Promise.resolve(ANNOTATIONS));
  const getProjectAccess = mock(() =>
    Promise.resolve(options.projectAccess ?? null)
  );
  const hasAnonymousShareAccessToProject = mock(() =>
    Promise.resolve(options.anonymousShareAccess ?? false)
  );

  const { ctx } = stubHttpCtx(
    {
      services: {
        reference: { getChartReferences },
        auth: { getProjectAccess },
        share: { hasAnonymousShareAccessToProject },
      },
    } as unknown as Parameters<typeof stubHttpCtx>[0],
    options.userId
      ? { session: {}, user: {}, userId: options.userId }
      : EMPTY_SESSION
  );

  return {
    getChartReferences,
    getProjectAccess,
    hasAnonymousShareAccessToProject,
    caller: async () =>
      referenceRouter.createCaller(
        await makeTrpcContext(ctx, new Headers(), {
          cookieOptions: COOKIE_OPTIONS,
        })
      ),
  };
}

test('getChartReferences refuses an anonymous caller with no unlocked share', async () => {
  const t = guardCaller({ userId: null, anonymousShareAccess: false });
  const caller = await t.caller();

  await expect(caller.getChartReferences(CHART_INPUT)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(t.hasAnonymousShareAccessToProject).toHaveBeenCalledTimes(1);
  expect(t.getChartReferences).not.toHaveBeenCalled();
});

test('getChartReferences serves an anonymous caller holding an unlocked share', async () => {
  const t = guardCaller({ userId: null, anonymousShareAccess: true });
  const caller = await t.caller();

  const result = await caller.getChartReferences(CHART_INPUT);
  expect(result).toEqual(ANNOTATIONS as unknown as typeof result);
  expect(t.hasAnonymousShareAccessToProject).toHaveBeenCalledTimes(1);
});

test('getChartReferences refuses a member without access to the project', async () => {
  const t = guardCaller({ userId: 'user_1', projectAccess: null });
  const caller = await t.caller();

  await expect(caller.getChartReferences(CHART_INPUT)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(t.getProjectAccess).toHaveBeenCalledTimes(1);
  expect(t.hasAnonymousShareAccessToProject).not.toHaveBeenCalled();
  expect(t.getChartReferences).not.toHaveBeenCalled();
});

test('getChartReferences serves a member with access', async () => {
  const t = guardCaller({ userId: 'user_1', projectAccess: { level: 'read' } });
  const caller = await t.caller();

  const result = await caller.getChartReferences(CHART_INPUT);
  expect(result).toEqual(ANNOTATIONS as unknown as typeof result);
  expect(t.getProjectAccess).toHaveBeenCalledTimes(1);
  expect(t.hasAnonymousShareAccessToProject).not.toHaveBeenCalled();
});

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
        reference: { createReference: write },
      },
    } as unknown as Parameters<typeof stubHttpCtx>[0],
    { session: {}, user: {}, userId: 'user_outsider' }
  );
  return {
    requireProjectAccess,
    caller: async () =>
      referenceRouter.createCaller(
        await makeTrpcContext(ctx, new Headers(), {
          cookieOptions: COOKIE_OPTIONS,
        })
      ),
  };
}

test('create refuses a signed-in user without write access to the project', async () => {
  const createReference = mock(() => Promise.resolve({}));
  const t = nonMemberCaller(createReference);
  const caller = await t.caller();

  await expect(
    caller.create({
      title: 'Launch',
      description: null,
      datetime: '2026-09-03T00:00:00.000Z',
      projectId: 'proj_1',
    })
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(t.requireProjectAccess).toHaveBeenCalledWith({
    userId: 'user_outsider',
    projectId: 'proj_1',
    level: 'write',
  });
  expect(createReference).not.toHaveBeenCalled();
});
