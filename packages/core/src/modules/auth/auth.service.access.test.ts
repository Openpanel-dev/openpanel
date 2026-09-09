// M10-002 (docs/TECH_DEBT.md §5b): auth.service.ts is now the ONLY place
// `shared/access.ts`'s ladder is bound to real lookups, via the lazy,
// memoized `getAccessChecks()`. This proves that seam still takes a fake
// `AccessLookups` cleanly — mocking `../../shared/access-lookups` and
// `../project/project.service` (both reached only through dynamic imports by
// auth.service.ts, never statically) instead of a per-module `src/access.ts`
// copy — and that ADR-011's fail-closed ordering, messages and write-level
// gate are unchanged.

import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { testServices } from '../../../test/service-deps';

interface FakeProjectAccess {
  level: 'read' | 'write' | 'admin';
}

let projectAccess: FakeProjectAccess | null = null;
let organizationAccess: { role: string } | null = null;
let projectById: { organizationId: string | null } | null = null;

const getProjectAccess = mock(async () => projectAccess);
const getOrganizationAccess = mock(async () => organizationAccess);
const canWriteProject = mock(
  (access: FakeProjectAccess | null) =>
    !!access && (access.level === 'write' || access.level === 'admin')
);
const getProjectById = mock(async () => projectById);

// Snapshotted BEFORE `mock.module` below, not after — restoring by
// re-`import`ing later would resolve the already-mocked registry entry, not
// the real module (bare `bun test` shares one module registry across every
// file, and both of these are reached by plenty of other modules —
// client.rpc.ts, project.rpc.ts, integration.service.ts, ...).
const realAccessLookups = { ...(await import('../../shared/access-lookups')) };
const realProjectService = { ...(await import('../project/project.service')) };

mock.module('../../shared/access-lookups', () => ({
  ...realAccessLookups,
  getProjectAccess,
  getOrganizationAccess,
  canWriteProject,
}));
mock.module('../project/project.service', () => ({
  ...realProjectService,
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
  mock.module('../project/project.service', () => realProjectService);
  // `getAccessChecks()` memoizes for the life of the process — clear it so a
  // later file in this bare run rebuilds against the real lookups just
  // restored above, not this file's fakes.
  resetAccessChecksForTests();
});

function authService() {
  // Both arguments are ignored by `createAuthService` — it takes them so the
  // composition root stays a flat list (ADR-022 R3). Every member reaches the
  // mocked lookups above.
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
  organizationAccess = { role: 'member' };
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
  organizationAccess = { role: 'org:admin' };
  await expect(
    authService().requireProjectAdmin({ userId: 'user_1', projectId: 'proj_1' })
  ).resolves.toEqual({ role: 'org:admin' });
});

test('getProjectAccess / getOrganizationAccess reach the same fake lookups', async () => {
  projectAccess = { level: 'admin' };
  organizationAccess = { role: 'org:admin' };
  await expect(
    authService().getProjectAccess({ userId: 'user_1', projectId: 'proj_1' })
  ).resolves.toEqual({ level: 'admin' });
  await expect(
    authService().getOrganizationAccess({
      userId: 'user_1',
      organizationId: 'org_1',
    })
  ).resolves.toMatchObject({ role: 'org:admin' });
});
