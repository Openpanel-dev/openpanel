// The subject is built by its factory over a fake `ServiceDeps` (M10-003), so
// Postgres needs no module mock at all — `deps.db` IS the fake below. Only the
// three sibling modules the service calls as plain functions are mocked, each
// at the specifier the source resolves through, snapshot-before-mock so
// `afterAll` restores the real module instead of re-applying the mock.

import { afterAll, beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { testCoreConfig } from '../../../test/config-fixture';
import { testServices } from '../../../test/service-deps';
import { createShareAccessToken } from '../../shared/share-access';

interface FakeShare {
  id: string;
  organizationId: string;
  projectId: string;
  public: boolean;
  password: string | null;
}

interface FakeDashboardShare extends FakeShare {
  dashboardId: string;
}

interface FakeReportShare extends FakeShare {
  reportId: string;
}

const overviewStore = new Map<string, FakeShare>();
const dashboardShareStore = new Map<string, FakeDashboardShare>();
const reportShareStore = new Map<string, FakeReportShare>();

const ORG = { name: 'Acme Inc' };
const PROJECT = { name: 'Landing page' };

function findOverviewByProjectId(projectId: string) {
  return [...overviewStore.values()].find((s) => s.projectId === projectId);
}

function findDashboardShareByDashboardId(dashboardId: string) {
  return [...dashboardShareStore.values()].find(
    (s) => s.dashboardId === dashboardId
  );
}

function findReportShareByReportId(reportId: string) {
  return [...reportShareStore.values()].find((s) => s.reportId === reportId);
}

const shareOverview = {
  findUnique: mock(
    async ({ where }: { where: { id?: string; projectId?: string } }) => {
      const share = where.id
        ? overviewStore.get(where.id)
        : where.projectId
          ? findOverviewByProjectId(where.projectId)
          : undefined;
      if (!share) {
        return null;
      }
      return { ...share, organization: ORG, project: PROJECT };
    }
  ),
  findFirst: mock(async ({ where: { id } }: { where: { id: string } }) => {
    const share = overviewStore.get(id);
    return share ? { ...share, project: PROJECT } : null;
  }),
  upsert: mock(
    async ({
      where: { projectId },
      create,
      update,
    }: {
      where: { projectId: string };
      create: FakeShare;
      update: { public: boolean; password: string | null };
    }) => {
      const existing = findOverviewByProjectId(projectId);
      const next = existing ? { ...existing, ...update } : { ...create };
      overviewStore.set(next.id, next);
      return next;
    }
  ),
};

const shareDashboard = {
  findUnique: mock(
    async ({ where }: { where: { id?: string; dashboardId?: string } }) => {
      const share = where.id
        ? dashboardShareStore.get(where.id)
        : where.dashboardId
          ? findDashboardShareByDashboardId(where.dashboardId)
          : undefined;
      if (!share) {
        return null;
      }
      return {
        ...share,
        organization: ORG,
        project: PROJECT,
        dashboard: { name: 'Main' },
      };
    }
  ),
  findFirst: mock(async ({ where: { id } }: { where: { id: string } }) => {
    const share = dashboardShareStore.get(id);
    if (!share) {
      return null;
    }
    return {
      ...share,
      dashboard: { name: 'Main', project: PROJECT, reports: [] },
    };
  }),
  upsert: mock(
    async ({
      where: { dashboardId },
      create,
      update,
    }: {
      where: { dashboardId: string };
      create: FakeDashboardShare;
      update: { public: boolean; password: string | null };
    }) => {
      const existing = findDashboardShareByDashboardId(dashboardId);
      const next = existing ? { ...existing, ...update } : { ...create };
      dashboardShareStore.set(next.id, next);
      return next;
    }
  ),
};

const shareReport = {
  findUnique: mock(
    async ({ where }: { where: { id?: string; reportId?: string } }) => {
      const share = where.id
        ? reportShareStore.get(where.id)
        : where.reportId
          ? findReportShareByReportId(where.reportId)
          : undefined;
      if (!share) {
        return null;
      }
      return {
        ...share,
        organization: ORG,
        project: PROJECT,
        report: { id: 'report_raw' },
      };
    }
  ),
  findFirst: mock(async ({ where: { id } }: { where: { id: string } }) => {
    const share = reportShareStore.get(id);
    return share ? { ...share, report: { project: PROJECT } } : null;
  }),
  upsert: mock(
    async ({
      where: { reportId },
      create,
      update,
    }: {
      where: { reportId: string };
      create: FakeReportShare;
      update: { public: boolean; password: string | null };
    }) => {
      const existing = findReportShareByReportId(reportId);
      const next = existing ? { ...existing, ...update } : { ...create };
      reportShareStore.set(next.id, next);
      return next;
    }
  ),
};

const getDashboardById = mock(
  async (_deps: unknown, id: string, projectId: string) =>
    id === 'dash_missing' ? null : { id, projectId, name: 'Main' }
);

const getReportById = mock(async (_deps: unknown, id: string) =>
  id === 'report_missing'
    ? null
    : { id, projectId: 'proj_1', name: 'Weekly report' }
);
const transformReport = mock((report: unknown) => ({
  ...(report as Record<string, unknown>),
  transformed: true,
}));
const getReportsByDashboardId = mock(async (_deps: unknown) => [
  { id: 'report_1' },
]);

const getProjectAccess = mock(
  async ({ userId }: { userId: string; projectId: string }) =>
    userId === 'member' ? { level: 'read' } : null
);

const actualDashboard = await import('../dashboard/dashboard.service');
const realDashboard = { ...actualDashboard };
mock.module('../dashboard/dashboard.service', () => ({
  ...realDashboard,
  getDashboardById,
}));
const actualReport = await import('../report/report.service');
const realReport = { ...actualReport };
mock.module('../report/report.service', () => ({
  ...realReport,
  getReportById,
  transformReport,
  getReportsByDashboardId,
}));
const actualAccessLookups = await import('../../shared/access-lookups');
const realAccessLookups = { ...actualAccessLookups };
mock.module('../../shared/access-lookups', () => ({
  ...realAccessLookups,
  getProjectAccess,
}));

afterAll(() => {
  mock.module('../dashboard/dashboard.service', () => realDashboard);
  mock.module('../report/report.service', () => realReport);
  mock.module('../../shared/access-lookups', () => realAccessLookups);
});

let subject: ReturnType<typeof import('./share.service').createShareService>;
beforeAll(async () => {
  const { createShareService } = await import('./share.service');
  subject = createShareService(
    {
      db: { shareOverview, shareDashboard, shareReport },
      config: testCoreConfig(),
    } as unknown as import('../../services').ServiceDeps,
    testServices()
  );
});

beforeEach(() => {
  overviewStore.clear();
  dashboardShareStore.clear();
  reportShareStore.clear();
  getDashboardById.mockClear();
  getReportById.mockClear();
  transformReport.mockClear();
  getReportsByDashboardId.mockClear();
  getProjectAccess.mockClear();
});

function cookies(values: Record<string, string> = {}) {
  return { get: (name: string) => values[name] };
}

/** The cookie a viewer gets from `signInToShare` — an HMAC, not a constant. */
function unlocked(
  type: 'overview' | 'dashboard' | 'report',
  id: string,
  passwordHash: string
) {
  return cookies({
    [`shared-${type}-${id}`]: createShareAccessToken(
      testCoreConfig().cookies.secret,
      { type, id, passwordHash }
    ),
  });
}

test('getShareOverview throws NOT_FOUND when the share is missing or not public', async () => {
  await expect(
    subject.getShareOverview('missing', cookies())
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });

  overviewStore.set('share_1', {
    id: 'share_1',
    organizationId: 'org_1',
    projectId: 'proj_1',
    public: false,
    password: null,
  });
  await expect(
    subject.getShareOverview('share_1', cookies())
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('getShareOverview stays locked for a forged cookie (GHSA-p6c2-mq9r-cx3r)', async () => {
  overviewStore.set('share_1', {
    id: 'share_1',
    organizationId: 'org_1',
    projectId: 'proj_1',
    public: true,
    password: 'hashed',
  });

  const result = await subject.getShareOverview(
    'share_1',
    cookies({ 'shared-overview-share_1': '1' })
  );

  expect(result).toMatchObject({ requiresPassword: true });
});

test('getShareOverview stays locked for a token minted for another share', async () => {
  overviewStore.set('share_1', {
    id: 'share_1',
    organizationId: 'org_1',
    projectId: 'proj_1',
    public: true,
    password: 'hashed',
  });
  const stolen = createShareAccessToken(testCoreConfig().cookies.secret, {
    type: 'overview',
    id: 'share_2',
    passwordHash: 'hashed',
  });

  const result = await subject.getShareOverview(
    'share_1',
    cookies({ 'shared-overview-share_1': stolen })
  );

  expect(result).toMatchObject({ requiresPassword: true });
});

test('getShareOverview returns a locked shape when password-protected without the unlock cookie', async () => {
  overviewStore.set('share_1', {
    id: 'share_1',
    organizationId: 'org_1',
    projectId: 'proj_1',
    public: true,
    password: 'hashed',
  });

  const result = await subject.getShareOverview('share_1', cookies());
  expect(result).toEqual({
    id: 'share_1',
    requiresPassword: true,
    organization: ORG,
    project: PROJECT,
  });
  // Never leaks the hash on the locked shape.
  expect(result).not.toHaveProperty('password');
});

test('getShareOverview unlocks with the shared-overview cookie', async () => {
  overviewStore.set('share_1', {
    id: 'share_1',
    organizationId: 'org_1',
    projectId: 'proj_1',
    public: true,
    password: 'hashed',
  });

  const result = await subject.getShareOverview(
    'share_1',
    unlocked('overview', 'share_1', 'hashed')
  );
  expect(result).toMatchObject({ id: 'share_1', requiresPassword: false });
});

test('getShareOverviewSettings returns null when no share exists for the project', async () => {
  expect(await subject.getShareOverviewSettings('proj_missing')).toBeNull();
});

test('createShareOverview hashes the password and reports hasPassword', async () => {
  const result = await subject.createShareOverview({
    organizationId: 'org_1',
    projectId: 'proj_1',
    public: true,
    password: 'sekret123',
  });
  expect(result).toMatchObject({ public: true, hasPassword: true });

  const noPassword = await subject.createShareOverview({
    organizationId: 'org_1',
    projectId: 'proj_2',
    public: false,
    password: null,
  });
  expect(noPassword).toMatchObject({ public: false, hasPassword: false });
});

test('createShareDashboard throws NOT_FOUND when the dashboard does not exist', async () => {
  await expect(
    subject.createShareDashboard({
      organizationId: 'org_1',
      projectId: 'proj_1',
      dashboardId: 'dash_missing',
      public: true,
      password: null,
    })
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('createShareDashboard upserts once the dashboard exists', async () => {
  const result = await subject.createShareDashboard({
    organizationId: 'org_1',
    projectId: 'proj_1',
    dashboardId: 'dash_1',
    public: true,
    password: null,
  });
  expect(result).toMatchObject({ public: true, hasPassword: false });
});

test('getShareDashboardReports rejects without the unlock cookie when password-protected', async () => {
  dashboardShareStore.set('share_1', {
    id: 'share_1',
    organizationId: 'org_1',
    projectId: 'proj_1',
    dashboardId: 'dash_1',
    public: true,
    password: 'hashed',
  });

  await expect(
    subject.getShareDashboardReports('share_1', cookies())
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('getShareDashboardReports returns the dashboard reports once unlocked', async () => {
  dashboardShareStore.set('share_1', {
    id: 'share_1',
    organizationId: 'org_1',
    projectId: 'proj_1',
    dashboardId: 'dash_1',
    public: true,
    password: null,
  });

  const result = await subject.getShareDashboardReports('share_1', cookies());
  expect(result).toMatchObject([{ id: 'report_1' }]);
  expect(getReportsByDashboardId).toHaveBeenCalledWith(
    expect.anything(),
    'dash_1'
  );
});

test('createShareReport throws NOT_FOUND when the report belongs to a different project', async () => {
  await expect(
    subject.createShareReport({
      organizationId: 'org_1',
      projectId: 'proj_other',
      reportId: 'report_1',
      public: true,
      password: null,
    })
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('getShareReport transforms the report once unlocked', async () => {
  reportShareStore.set('share_1', {
    id: 'share_1',
    organizationId: 'org_1',
    projectId: 'proj_1',
    reportId: 'report_1',
    public: true,
    password: null,
  });

  const result = await subject.getShareReport('share_1', cookies());
  expect(result).toMatchObject({ id: 'share_1', requiresPassword: false });
  expect(transformReport).toHaveBeenCalledWith({ id: 'report_raw' });
});

test('validateOverviewShareAccess requires membership when no shareId is given', async () => {
  await expect(
    subject.validateOverviewShareAccess(undefined, 'proj_1', {
      cookies: cookies(),
      session: undefined,
    })
  ).rejects.toThrow('Authentication required');

  await expect(
    subject.validateOverviewShareAccess(undefined, 'proj_1', {
      cookies: cookies(),
      session: { userId: 'stranger' },
    })
  ).rejects.toThrow('You do not have access to this project');

  const result = await subject.validateOverviewShareAccess(
    undefined,
    'proj_1',
    {
      cookies: cookies(),
      session: { userId: 'member' },
    }
  );
  expect(result).toEqual({ isValid: true });
});
