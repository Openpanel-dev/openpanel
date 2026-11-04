// Proves `getAccessChecks` accepts fake `AccessLookups`, and that the
// fail-closed ordering, messages and write-level gate hold.

import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { testServices } from '../../../test/service-deps';

interface FakeProjectAccess {
  level: 'read' | 'write' | 'admin';
}

let projectAccess: FakeProjectAccess | null = null;
interface FakeOrganizationAccess {
  role: string;
  userId: string;
}

let organizationAccess: FakeOrganizationAccess | null = null;

const memberAccess = (role: string): FakeOrganizationAccess => ({
  role,
  userId: 'user_1',
});
let projectById: { organizationId: string | null } | null = null;

const getProjectAccess = mock(async () => projectAccess);
const getOrganizationAccess = mock(async () => organizationAccess);
const canWriteProject = mock(
  (access: FakeProjectAccess | null) =>
    !!access && (access.level === 'write' || access.level === 'admin')
);
const getProjectById = mock(async () => projectById);

// Snapshotted before `mock.module`: bare `bun test` shares one module registry
// across files, so re-importing later would return the mocked entry.
const realAccessLookups = { ...(await import('../../shared/access-lookups')) };

mock.module('../../shared/access-lookups', () => ({
  ...realAccessLookups,
  getProjectAccess,
  getOrganizationAccess,
  canWriteProject,
  getProjectById,
}));

let createAuthService: typeof import('./auth.service').createAuthService;
let resetAccessChecksForTests: typeof import('./auth.service').resetAccessChecksForTests;
beforeAll(async () => {
  ({ createAuthService, resetAccessChecksForTests } = await import(
    './auth.service'
  ));
});

afterAll(() => {
  mock.module('../../shared/access-lookups', () => realAccessLookups);
  // `getAccessChecks()` memoizes per process; clear it so later files in a bare
  // run use the real lookups.
  resetAccessChecksForTests();
});

function authService() {
  return createAuthService(
    {} as import('../../services').ServiceDeps,
    testServices()
  );
}

test('requireProjectAccess is fail-closed: no access throws before the write-level check', async () => {
  projectAccess = null;
  await expect(
    authService().requireProjectAccess({
      userId: 'user_1',
      projectId: 'proj_1',
      level: 'read',
    })
  ).rejects.toThrow('You do not have access to this project');
  expect(canWriteProject).not.toHaveBeenCalled();
});

test('requireProjectAccess rejects a read-only member asking for write', async () => {
  projectAccess = { level: 'read' };
  await expect(
    authService().requireProjectAccess({
      userId: 'user_1',
      projectId: 'proj_1',
      level: 'write',
    })
  ).rejects.toThrow('You have read-only access to this project');
});

test('requireProjectAccess allows write and admin levels to write', async () => {
  projectAccess = { level: 'write' };
  await expect(
    authService().requireProjectAccess({
      userId: 'user_1',
      projectId: 'proj_1',
      level: 'write',
    })
  ).resolves.toEqual({ level: 'write' });

  projectAccess = { level: 'admin' };
  await expect(
    authService().requireProjectAccess({
      userId: 'user_1',
      projectId: 'proj_1',
      level: 'write',
    })
  ).resolves.toEqual({ level: 'admin' });
});

test('requireOrganizationAdmin rejects a non-admin with the default message', async () => {
  organizationAccess = memberAccess('member');
  await expect(
    authService().requireOrganizationAdmin({
      userId: 'user_1',
      organizationId: 'org_1',
    })
  ).rejects.toThrow('Only organization admins can do this');
});

test('requireOrganizationAdmin honors a caller-supplied message', async () => {
  organizationAccess = null;
  await expect(
    authService().requireOrganizationAdmin({
      userId: 'user_1',
      organizationId: 'org_1',
      message: 'Only organization admins can change an org-wide integration',
    })
  ).rejects.toThrow(
    'Only organization admins can change an org-wide integration'
  );
});

test('requireProjectAdmin fails closed when the project has no organization', async () => {
  projectById = null;
  await expect(
    authService().requireProjectAdmin({ userId: 'user_1', projectId: 'proj_1' })
  ).rejects.toThrow('You do not have access to this project');
});

test('requireProjectAdmin defers to the organization-admin gate once resolved', async () => {
  projectById = { organizationId: 'org_1' };
  organizationAccess = memberAccess('admin');
  await expect(
    authService().requireProjectAdmin({ userId: 'user_1', projectId: 'proj_1' })
  ).resolves.toMatchObject({ role: 'admin' });
});

test('requireOrganizationAdmin accepts owner and admin, and refuses member and viewer', async () => {
  for (const role of ['admin', 'owner']) {
    organizationAccess = memberAccess(role);
    await expect(
      authService().requireOrganizationAdmin({
        userId: 'user_1',
        organizationId: 'org_1',
      })
    ).resolves.toBeDefined();
  }
  for (const role of ['member', 'viewer']) {
    organizationAccess = memberAccess(role);
    await expect(
      authService().requireOrganizationAdmin({
        userId: 'user_1',
        organizationId: 'org_1',
      })
    ).rejects.toThrow('Only organization admins can do this');
  }
});

test('getOrganizationAccess reports the stored role, the old spellings by their new names, and an unknown one as member', async () => {
  for (const role of ['owner', 'admin', 'member', 'viewer']) {
    organizationAccess = memberAccess(role);
    await expect(
      authService().getOrganizationAccess({
        userId: 'user_1',
        organizationId: 'org_1',
      })
    ).resolves.toMatchObject({ role });
  }

  const readAs: [stored: string, role: string][] = [
    ['org:admin', 'member'],
    ['superuser', 'member'],
  ];
  for (const [stored, role] of readAs) {
    organizationAccess = memberAccess(stored);
    await expect(
      authService().getOrganizationAccess({
        userId: 'user_1',
        organizationId: 'org_1',
      })
    ).resolves.toMatchObject({ role });
  }
});

test('getProjectAccess / getOrganizationAccess reach the same fake lookups', async () => {
  projectAccess = { level: 'admin' };
  organizationAccess = memberAccess('admin');
  await expect(
    authService().getProjectAccess({ userId: 'user_1', projectId: 'proj_1' })
  ).resolves.toEqual({ level: 'admin' });
  await expect(
    authService().getOrganizationAccess({
      userId: 'user_1',
      organizationId: 'org_1',
    })
  ).resolves.toMatchObject({ role: 'admin' });
});
