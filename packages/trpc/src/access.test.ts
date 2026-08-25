import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getProjectAccess, getOrganizationAccess, getProjectById } = vi.hoisted(
  () => ({
    getProjectAccess: vi.fn(),
    getOrganizationAccess: vi.fn(),
    getProjectById: vi.fn(),
  }),
);

vi.mock('@openpanel/db', () => ({
  getProjectAccess,
  getOrganizationAccess,
  getProjectById,
  getClientAccess: vi.fn(),
  // The real implementation - `admin` is a superset of `write`.
  canWriteProject: (access: { level: string } | null) =>
    !!access && (access.level === 'write' || access.level === 'admin'),
}));

import {
  requireOrganizationAdmin,
  requireProjectAccess,
  requireProjectAdmin,
} from './access';

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * GHSA-f9rx-pxgw-c6rg: 26 of 29 mutating procedures tested `if (!access)`,
 * and a `{ level: 'read' }` row is a truthy object, so read-only members could
 * delete projects and publish private analytics.
 */
describe('requireProjectAccess', () => {
  it('rejects a non-member at every level', async () => {
    getProjectAccess.mockResolvedValue(null);

    await expect(
      requireProjectAccess({ userId: 'u', projectId: 'p', level: 'read' }),
    ).rejects.toThrow('You do not have access to this project');
  });

  it('rejects a read-level member from writing', async () => {
    getProjectAccess.mockResolvedValue({ level: 'read' });

    await expect(
      requireProjectAccess({ userId: 'u', projectId: 'p', level: 'write' }),
    ).rejects.toThrow('read-only');
  });

  it('lets a read-level member read', async () => {
    getProjectAccess.mockResolvedValue({ level: 'read' });

    await expect(
      requireProjectAccess({ userId: 'u', projectId: 'p', level: 'read' }),
    ).resolves.toEqual({ level: 'read' });
  });

  it.each(['write', 'admin'])('lets a %s-level member write', async (level) => {
    getProjectAccess.mockResolvedValue({ level });

    await expect(
      requireProjectAccess({ userId: 'u', projectId: 'p', level: 'write' }),
    ).resolves.toEqual({ level });
  });
});

describe('requireOrganizationAdmin', () => {
  it('rejects a plain member', async () => {
    getOrganizationAccess.mockResolvedValue({ role: 'org:member' });

    await expect(
      requireOrganizationAdmin({ userId: 'u', organizationId: 'o' }),
    ).rejects.toThrow('Only organization admins');
  });

  it('rejects a non-member', async () => {
    getOrganizationAccess.mockResolvedValue(null);

    await expect(
      requireOrganizationAdmin({ userId: 'u', organizationId: 'o' }),
    ).rejects.toThrow('Only organization admins');
  });

  it('allows an org admin', async () => {
    getOrganizationAccess.mockResolvedValue({ role: 'org:admin' });

    await expect(
      requireOrganizationAdmin({ userId: 'u', organizationId: 'o' }),
    ).resolves.toEqual({ role: 'org:admin' });
  });
});

describe('requireProjectAdmin', () => {
  it('resolves the org from the project, then requires admin', async () => {
    getProjectById.mockResolvedValue({ organizationId: 'o' });
    getOrganizationAccess.mockResolvedValue({ role: 'org:member' });

    await expect(
      requireProjectAdmin({ userId: 'u', projectId: 'p' }),
    ).rejects.toThrow('Only organization admins');

    expect(getOrganizationAccess).toHaveBeenCalledWith({
      userId: 'u',
      organizationId: 'o',
    });
  });

  it('rejects when the project has no organization', async () => {
    getProjectById.mockResolvedValue(null);

    await expect(
      requireProjectAdmin({ userId: 'u', projectId: 'p' }),
    ).rejects.toThrow('You do not have access to this project');

    expect(getOrganizationAccess).not.toHaveBeenCalled();
  });

  // A write-level member must not be able to schedule a project for deletion
  // just because they can edit reports in it.
  it('allows an org admin', async () => {
    getProjectById.mockResolvedValue({ organizationId: 'o' });
    getOrganizationAccess.mockResolvedValue({ role: 'org:admin' });

    await expect(
      requireProjectAdmin({ userId: 'u', projectId: 'p' }),
    ).resolves.toEqual({ role: 'org:admin' });
  });
});
