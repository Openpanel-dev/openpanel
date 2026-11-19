import { expect, mock, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import { TRPCForbiddenError } from '../../rpc/errors';
import type { CookieOptions } from '../../shared/cookie';
import { importRouter } from './import.rpc';

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
  return importRouter.createCaller(trpcCtx);
}

test('list rejects an unauthenticated caller before touching a project', async () => {
  const caller = await anonCaller();
  await expect(caller.list({ projectId: 'proj_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('create rejects an unauthenticated caller before writing an import', async () => {
  const caller = await anonCaller();
  await expect(
    caller.create({
      projectId: 'proj_1',
      provider: 'umami',
      config: {
        provider: 'umami',
        type: 'file',
        fileUrl: 'https://example.com/export.csv',
        projectMapper: [],
      },
    })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('delete rejects an unauthenticated caller before removing an import', async () => {
  const caller = await anonCaller();
  await expect(caller.delete({ id: 'imp_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('retry rejects an unauthenticated caller before re-enqueuing', async () => {
  const caller = await anonCaller();
  await expect(caller.retry({ id: 'imp_1' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

function memberCaller(
  overrides: Record<string, unknown>,
  writableProjectIds: string[] = ['proj_1']
) {
  const requireProjectAccess = mock(({ projectId }: { projectId: string }) =>
    writableProjectIds.includes(projectId)
      ? Promise.resolve({ level: 'write' })
      : Promise.reject(
          new TRPCForbiddenError('You do not have access to this project')
        )
  );
  const { ctx } = stubHttpCtx({
    services: { auth: { requireProjectAccess } },
    ...overrides,
  } as unknown as Parameters<typeof stubHttpCtx>[0]);
  return {
    requireProjectAccess,
    caller: async () =>
      importRouter.createCaller(
        await makeTrpcContext(ctx, new Headers(), {
          cookieOptions: COOKIE_OPTIONS,
        })
      ),
  };
}

test('list never returns provider credentials or a presigned query string', async () => {
  const findMany = mock(() =>
    Promise.resolve([
      {
        id: 'imp_1',
        projectId: 'proj_1',
        config: {
          provider: 'mixpanel',
          type: 'api',
          serviceAccount: 'svc-account',
          serviceSecret: 'svc-secret',
          projectId: '123',
          from: '2025-01-01',
          to: '2025-01-31',
        },
      },
      {
        id: 'imp_2',
        projectId: 'proj_1',
        config: {
          provider: 'amplitude',
          type: 'api',
          apiKey: 'amp-key',
          secretKey: 'amp-secret',
          from: '2025-01-01',
          to: '2025-01-31',
        },
      },
      {
        id: 'imp_3',
        projectId: 'proj_1',
        config: {
          provider: 'umami',
          type: 'file',
          fileUrl:
            'https://bucket.s3.amazonaws.com/export.csv?X-Amz-Signature=abc',
          projectMapper: [],
        },
      },
    ])
  );
  const t = memberCaller({ db: { import: { findMany } } });
  const caller = await t.caller();

  const imports = await caller.list({ projectId: 'proj_1' });

  expect(findMany).toHaveBeenCalledTimes(1);
  const serialized = JSON.stringify(imports);
  for (const secret of ['svc-account', 'svc-secret', 'amp-key', 'amp-secret']) {
    expect(serialized).not.toContain(secret);
  }
  expect(imports[2]?.config).toMatchObject({
    fileUrl: 'https://bucket.s3.amazonaws.com/export.csv',
  });
});

test('create refuses an Umami mapping into a project the caller cannot write', async () => {
  const create = mock(() => Promise.resolve({ id: 'imp_1' }));
  const t = memberCaller({ db: { import: { create } } });
  const caller = await t.caller();

  await expect(
    caller.create({
      projectId: 'proj_1',
      provider: 'umami',
      config: {
        provider: 'umami',
        type: 'file',
        fileUrl: 'https://example.com/export.csv',
        projectMapper: [{ from: 'website_1', to: 'proj_other' }],
      },
    })
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(t.requireProjectAccess).toHaveBeenCalledWith({
    userId: 'user_1',
    projectId: 'proj_other',
    level: 'write',
  });
  expect(create).not.toHaveBeenCalled();
});
