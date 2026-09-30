import { beforeEach, describe, expect, it, vi } from 'vitest';

const { referenceFindMany, hasAnonymousShareAccessToProject, getProjectAccess } =
  vi.hoisted(() => ({
    referenceFindMany: vi.fn(),
    hasAnonymousShareAccessToProject: vi.fn(),
    getProjectAccess: vi.fn(),
  }));

vi.mock('@openpanel/db', () => ({
  db: { reference: { findMany: referenceFindMany } },
  getChartStartEndDate: () => ({
    startDate: '2024-01-01T00:00:00.000Z',
    endDate: '2024-02-01T00:00:00.000Z',
  }),
  getSettingsForProject: vi.fn().mockResolvedValue({ timezone: 'UTC' }),
  hasAnonymousShareAccessToProject,
  getProjectAccess,
  getOrganizationAccess: vi.fn(),
  getClientAccess: vi.fn(),
  canWriteProject: vi.fn(),
  runWithAlsSession: (_id: unknown, fn: () => unknown) => fn(),
}));

import { referenceRouter } from './reference';

// An unauthenticated request carries an empty session, not a missing one.
const caller = (session: { userId: string | null }, cookies = {}) =>
  referenceRouter.createCaller({
    req: { log: { info: vi.fn(), error: vi.fn() } },
    res: {},
    session,
    setCookie: vi.fn(),
    cookies,
  } as never);

const input = {
  projectId: 'victim-project',
  range: '30d' as const,
  startDate: null,
  endDate: null,
};

describe('reference.getChartReferences (GHSA-vrrm-p9p4-2gfg)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    referenceFindMany.mockResolvedValue([{ title: 'Deploy v2' }]);
  });

  it('refuses an anonymous caller when the project has no unlocked share', async () => {
    hasAnonymousShareAccessToProject.mockResolvedValue(false);
    await expect(caller({ userId: null }).getChartReferences(input)).rejects.toThrow(
      'do not have access',
    );
    expect(referenceFindMany).not.toHaveBeenCalled();
  });

  it('serves an anonymous caller who holds an unlocked public share', async () => {
    hasAnonymousShareAccessToProject.mockResolvedValue(true);
    const cookies = { 'shared-overview-abc': 'token' };
    const res = await caller({ userId: null }, cookies).getChartReferences(input);
    expect(res).toEqual([{ title: 'Deploy v2' }]);
    expect(hasAnonymousShareAccessToProject).toHaveBeenCalledWith(
      'victim-project',
      cookies,
    );
  });

  it('refuses a member without access to the project', async () => {
    getProjectAccess.mockResolvedValue(null);
    await expect(
      caller({ userId: 'u1' }).getChartReferences(input),
    ).rejects.toThrow('do not have access');
    expect(hasAnonymousShareAccessToProject).not.toHaveBeenCalled();
  });

  it('serves a member with access', async () => {
    getProjectAccess.mockResolvedValue({ level: 'read' });
    const res = await caller({ userId: 'u1' }).getChartReferences(input);
    expect(res).toEqual([{ title: 'Deploy v2' }]);
  });
});
