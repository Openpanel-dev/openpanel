// No database: the anonymous tests stop at the login boundary, and the update
// tests stub `ctx.services` to assert what the procedure hands the service.

import { expect, test } from 'bun:test';
import {
  servicesWithProjectAccess,
  stubHttpCtx,
} from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { Services } from '../../services';
import type { CookieOptions } from '../../shared/cookie';
import { projectRouter } from './project.rpc';

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

async function updateCallerRecordingInput() {
  const updates: unknown[] = [];
  const services = {
    ...servicesWithProjectAccess(),
    project: {
      getProjectById: () =>
        Promise.resolve({ id: 'proj_1', organizationId: 'org_1' }),
      updateProjectForOrganization: (
        _id: string,
        _organizationId: string,
        input: unknown
      ) => {
        updates.push(input);
        return Promise.resolve(null);
      },
    },
  } as unknown as Services;
  const { ctx } = stubHttpCtx({ services });
  const trpcCtx = await makeTrpcContext(ctx, new Headers(), {
    cookieOptions: COOKIE_OPTIONS,
  });
  return { caller: projectRouter.createCaller(trpcCtx), updates };
}

test('update passes exclude filters through to the service', async () => {
  const { caller, updates } = await updateCallerRecordingInput();
  const filters = [{ type: 'ip' as const, ip: '203.0.113.7' }];

  await caller.update({ id: 'proj_1', filters });

  expect(updates).toEqual([expect.objectContaining({ filters })]);
});

test('update leaves filters undefined when the caller omits them', async () => {
  const { caller, updates } = await updateCallerRecordingInput();

  await caller.update({ id: 'proj_1', name: 'Renamed' });

  expect(updates).toEqual([expect.objectContaining({ filters: undefined })]);
});
