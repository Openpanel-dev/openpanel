import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above the module scope, so the spies have to be too.
const {
  shareReportFindUnique,
  shareDashboardFindUnique,
  shareOverviewFindUnique,
} = vi.hoisted(() => ({
  shareReportFindUnique: vi.fn(),
  shareDashboardFindUnique: vi.fn(),
  shareOverviewFindUnique: vi.fn(),
}));

vi.mock('@openpanel/db', () => ({
  db: {
    shareReport: { findUnique: shareReportFindUnique },
    shareDashboard: { findUnique: shareDashboardFindUnique },
    shareOverview: { findUnique: shareOverviewFindUnique },
  },
  transformReport: (report: unknown) => report,
  getDashboardById: vi.fn(),
  getReportById: vi.fn(),
  getReportsByDashboardId: vi.fn(),
  getShareDashboardById: vi.fn(),
  getProjectById: vi.fn(),
  getProjectAccess: vi.fn(),
  getOrganizationAccess: vi.fn(),
  getClientAccess: vi.fn(),
  canWriteProject: vi.fn(),
  runWithAlsSession: (_id: unknown, fn: () => unknown) => fn(),
}));

import { shareRouter } from './share';

const PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$NTb6p8dXsP2b1WpDU22i/w$ILi3tmTMYg5TSrjvVktAbixLHPH5PjvvbQypR9bZuoQ';

const REPORT = {
  id: 'report-uuid',
  name: 'Q4 Revenue — CONFIDENTIAL',
  events: [{ name: 'checkout_completed_SECRET_EVENT' }],
  breakdowns: [{ name: 'CONFIDENTIAL_breakdown' }],
};

/** An unauthenticated caller: no session, no unlock cookie. */
const anonCaller = (cookies: Record<string, string> = {}) =>
  shareRouter.createCaller({
    req: { log: { info: vi.fn(), error: vi.fn() } },
    res: {},
    session: null,
    setCookie: vi.fn(),
    cookies,
  } as never);

const privatePasswordProtectedShare = {
  id: 'SECRT1',
  public: false,
  password: PASSWORD_HASH,
  projectId: 'victim-project',
  organization: { name: 'VictimOrg' },
  project: { name: 'Victim Project' },
  report: REPORT,
  dashboard: { name: 'Confidential Dashboard' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * GHSA-7gv7-c464-9wh8: these three procedures spread the whole share row into
 * the response, so an unauthenticated caller holding a share link received the
 * argon2 password hash - and, for reports, the full report definition - while
 * the same response said they had no access.
 */
describe('share lookups do not leak the password hash', () => {
  it('refuses a non-public report share outright', async () => {
    shareReportFindUnique.mockResolvedValue(privatePasswordProtectedShare);

    await expect(
      anonCaller().report({ shareId: 'SECRT1' }),
    ).rejects.toThrow('Report share not found');
  });

  it('refuses a non-public dashboard share outright', async () => {
    shareDashboardFindUnique.mockResolvedValue(privatePasswordProtectedShare);

    await expect(
      anonCaller().dashboard({ shareId: 'SECRT1' }),
    ).rejects.toThrow('Dashboard share not found');
  });

  it('refuses a non-public overview share outright', async () => {
    shareOverviewFindUnique.mockResolvedValue(privatePasswordProtectedShare);

    await expect(
      anonCaller().overview({ shareId: 'SECRT1' }),
    ).rejects.toThrow('Share not found');
  });

  it('withholds the hash and the report from a locked public share', async () => {
    shareReportFindUnique.mockResolvedValue({
      ...privatePasswordProtectedShare,
      public: true,
    });

    const res = await anonCaller().report({ shareId: 'SECRT1' });

    expect(res.requiresPassword).toBe(true);
    expect(JSON.stringify(res)).not.toContain('$argon2id');
    expect(JSON.stringify(res)).not.toContain('CONFIDENTIAL');
    expect(res).not.toHaveProperty('password');
    expect(res).not.toHaveProperty('report');
    expect(res).not.toHaveProperty('projectId');
  });

  it('withholds projectId from a locked overview share', async () => {
    shareOverviewFindUnique.mockResolvedValue({
      ...privatePasswordProtectedShare,
      public: true,
    });

    const res = await anonCaller().overview({ shareId: 'SECRT1' });

    expect(res.requiresPassword).toBe(true);
    expect(res).not.toHaveProperty('projectId');
    expect(JSON.stringify(res)).not.toContain('$argon2id');
  });

  it('serves the report once unlocked, still without the hash', async () => {
    shareReportFindUnique.mockResolvedValue({
      ...privatePasswordProtectedShare,
      public: true,
    });

    const res = await anonCaller({
      'shared-report-SECRT1': '1',
    }).report({ shareId: 'SECRT1' });

    expect(res.requiresPassword).toBe(false);
    expect(res).toHaveProperty('report');
    expect(JSON.stringify(res)).not.toContain('$argon2id');
  });

  it('never selects the row by reportId, so object ids are not addressable', async () => {
    // The union input used to accept { reportId }, which let anyone knowing a
    // report id read the share row without ever seeing a share link.
    await expect(
      // @ts-expect-error - deliberately calling the removed input shape
      anonCaller().report({ reportId: 'report-uuid' }),
    ).rejects.toThrow();
  });
});
