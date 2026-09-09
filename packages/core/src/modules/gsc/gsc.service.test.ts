// gsc.service.ts's db/ch access is lazy (`await import(...)` inside each
// function — see the file's header), which is exactly what makes
// `mock.module` work here with no import-time side effects to race: every
// mock below is registered before the subject's first call, not before its
// (side-effect-free) import.

import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { testCoreConfig } from '../../../test/config-fixture';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);

interface FakeGscConnection {
  projectId: string;
  siteUrl: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  backfillStatus: string | null;
}

const gscConnectionStore = new Map<string, FakeGscConnection>();

const gscConnection = {
  findUnique: mock(
    async ({ where: { projectId } }: { where: { projectId: string } }) =>
      gscConnectionStore.get(projectId) ?? null
  ),
  findUniqueOrThrow: mock(
    async ({ where: { projectId } }: { where: { projectId: string } }) => {
      const conn = gscConnectionStore.get(projectId);
      if (!conn) {
        throw new Error(`gscConnection ${projectId} not found`);
      }
      return conn;
    }
  ),
  findMany: mock(async () =>
    [...gscConnectionStore.values()]
      .filter((c) => c.siteUrl !== '')
      .map((c) => ({ projectId: c.projectId }))
  ),
  update: mock(
    async ({
      where: { projectId },
      data,
    }: {
      where: { projectId: string };
      data: Partial<FakeGscConnection>;
    }) => {
      const existing = gscConnectionStore.get(projectId);
      const updated = { ...existing, ...data } as FakeGscConnection;
      gscConnectionStore.set(projectId, updated);
      return updated;
    }
  ),
  upsert: mock(
    async ({
      where: { projectId },
      create,
      update,
    }: {
      where: { projectId: string };
      create: FakeGscConnection;
      update: Partial<FakeGscConnection>;
    }) => {
      const existing = gscConnectionStore.get(projectId);
      const value = existing
        ? ({ ...existing, ...update } as FakeGscConnection)
        : create;
      gscConnectionStore.set(projectId, value);
      return value;
    }
  ),
  deleteMany: mock(
    async ({ where: { projectId } }: { where: { projectId: string } }) => {
      const existed = gscConnectionStore.delete(projectId);
      return { count: existed ? 1 : 0 };
    }
  ),
};

const project = {
  findUnique: mock(async ({ where: { id } }: { where: { id: string } }) =>
    id === 'proj_missing' ? null : { id, organizationId: 'org_1' }
  ),
  // `resolveGscDateRange` reaches organization.service's `getSettingsForProject`
  // over the SAME deps (M10-009), which reads the project's organization
  // rather than going through a mocked module.
  findUniqueOrThrow: mock(async () => ({
    organization: { timezone: 'UTC' },
  })),
};

const chQuery = mock(async () => [] as unknown[]);
const ch = {
  query: mock(async () => ({ json: async () => [] as unknown[] })),
  insert: mock(async () => undefined),
};

// M10-009: the subject's functions take `ServiceDeps`, so `deps.db`/`deps.ch`
// ARE the fakes above — no `@openpanel/db` module mock is needed for either.
// The one module still mocked is core's own `shared/ch-query`, which is what
// the subject now calls.
// `mock.module` has no per-file scope under bare `bun test` (AGENTS.md), so
// snapshot the real module into a plain object FIRST and restore it in
// afterAll — restoring via the live import binding would re-apply the mock.
const realChQuery = { ...(await import('../../shared/ch-query')) };
mock.module('../../shared/ch-query', () => ({
  ...realChQuery,
  chQuery: (_deps: unknown, ...args: unknown[]) => chQuery(...(args as [])),
}));

const deps = {
  db: { gscConnection, project },
  ch,
  // The GSC tokens are stored encrypted; the key arrives as config now.
  config: testCoreConfig({ encryptionKey: 'a'.repeat(64) }),
} as unknown as import('../../services').ServiceDeps;
// Bypasses the Redis cache-aside entirely — `getGscCannibalization`'s own
// logic is exercised directly, its caching is @openpanel/redis's concern.
// `getRedisCache` is unused here but included for the same cross-file
// mock.module reason as above.
const realRedis = { ...(await import('@openpanel/redis')) };
mock.module('@openpanel/redis', () => ({
  ...realRedis,
  cacheable: <T>(fn: T) => fn,
  getRedisCache: () => ({
    get: async () => null,
    setex: async () => undefined,
  }),
}));

// `@openpanel/redis` above is a fake stuck in place for the rest of the
// process once this file's tests finish (`mock.module` has no per-file scope
// without `--isolate` — see AGENTS.md). Restore the real snapshot so whichever
// file runs next sees real behavior again.
afterAll(() => {
  mock.module('@openpanel/redis', () => realRedis);
  mock.module('../../shared/ch-query', () => realChQuery);
  mock.module(
    '../organization/organization.service',
    () => realOrganizationService
  );
  mock.module('../../shared/date', () => realSharedDate);
});

const validateAuthorizationCode = mock(async () => ({
  accessToken: () => 'google-access-token',
  hasRefreshToken: () => true,
  refreshToken: () => 'google-refresh-token',
  accessTokenExpiresAt: () => new Date('2026-09-04T00:00:00.000Z'),
}));
// Spread the real module — see the clickhouse/client mock above for why a
// partial factory here is a process-wide hazard, not a local one. Surfaced
// by M6-001: @openpanel/db's organization.service.ts shim (imported below)
// now re-exports from @openpanel/core's full barrel, which reaches this
// same auth.service.ts for createAuthService — a partial replacement here
// used to be invisible because nothing else in this file's chain needed it.
const actualAuthService = await import('../auth/auth.service');
mock.module('../auth/auth.service', () => ({
  ...actualAuthService,
  googleGscClient: () => ({ validateAuthorizationCode }),
}));

const getSettingsForProject = mock(
  async (_deps: unknown, _projectId: string) => ({ timezone: 'UTC' })
);
const getChartStartEndDate = mock(() => ({
  startDate: '2026-09-01T00:00:00.000Z',
  endDate: '2026-09-03T00:00:00.000Z',
}));
// M10-009: `resolveGscDateRange` reaches these two through the DEEP modules
// they live in, not through this package's barrel (`core-no-self-barrel`), so
// that is what has to be mocked — mocking `@openpanel/core` would no longer
// intercept anything. Each factory spreads its real module: `mock.module`
// replaces a specifier process-wide under bare `bun test` (AGENTS.md), and
// both are restored from a plain-object snapshot in afterAll below.
const realOrganizationService = {
  ...(await import('../organization/organization.service')),
};
mock.module('../organization/organization.service', () => ({
  ...realOrganizationService,
  getSettingsForProject,
}));
const realSharedDate = { ...(await import('../../shared/date')) };
mock.module('../../shared/date', () => ({
  ...realSharedDate,
  getChartStartEndDate,
}));

function stubLogger(): import('../../logger').Logger {
  const noop = () => undefined;
  const logger: import('../../logger').Logger = {
    fatal: noop,
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    trace: noop,
    child: () => logger,
  };
  return logger;
}

let subject: typeof import('./gsc.service');
beforeAll(async () => {
  subject = await import('./gsc.service');
});

test('listGscConnectionsForSync returns only projects with a siteUrl', async () => {
  gscConnectionStore.clear();
  gscConnectionStore.set('p1', {
    projectId: 'p1',
    siteUrl: 'https://one.example.com',
    accessToken: '',
    refreshToken: '',
    accessTokenExpiresAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    backfillStatus: null,
  });
  gscConnectionStore.set('p2', {
    projectId: 'p2',
    siteUrl: '',
    accessToken: '',
    refreshToken: '',
    accessTokenExpiresAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    backfillStatus: null,
  });

  const result = await subject.listGscConnectionsForSync(deps);
  expect(result).toEqual([{ projectId: 'p1' }]);
});

test('getGscConnection returns null when no connection exists', async () => {
  gscConnectionStore.clear();
  const result = await subject.getGscConnection(deps, 'missing');
  expect(result).toBeNull();
});

test('selectGscSite throws TRPCNotFoundError when the connection is missing', async () => {
  gscConnectionStore.clear();
  await expect(
    subject.selectGscSite(deps, 'missing', 'https://example.com')
  ).rejects.toMatchObject({ message: 'GSC connection not found' });
});

test('selectGscSite updates siteUrl and resets backfillStatus to pending', async () => {
  gscConnectionStore.clear();
  gscConnectionStore.set('p1', {
    projectId: 'p1',
    siteUrl: '',
    accessToken: '',
    refreshToken: '',
    accessTokenExpiresAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    backfillStatus: null,
  });

  await subject.selectGscSite(deps, 'p1', 'https://example.com');

  expect(gscConnectionStore.get('p1')).toMatchObject({
    siteUrl: 'https://example.com',
    backfillStatus: 'pending',
  });
});

test('disconnectGscConnection removes the stored connection', async () => {
  gscConnectionStore.clear();
  gscConnectionStore.set('p1', {
    projectId: 'p1',
    siteUrl: 'https://example.com',
    accessToken: '',
    refreshToken: '',
    accessTokenExpiresAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    backfillStatus: null,
  });

  await subject.disconnectGscConnection(deps, 'p1');
  expect(gscConnectionStore.has('p1')).toBe(false);
});

test('runGscProjectSync skips silently when there is no connected site', async () => {
  gscConnectionStore.clear();
  await expect(
    subject.runGscProjectSync(deps, 'missing', stubLogger())
  ).resolves.toBeUndefined();
});

test('runGscProjectSync records an error status when the token refresh has no credentials', async () => {
  gscConnectionStore.clear();
  gscConnectionStore.set('p1', {
    projectId: 'p1',
    siteUrl: 'https://example.com',
    accessToken: 'enc:whatever',
    refreshToken: 'enc:whatever',
    accessTokenExpiresAt: null, // forces the refresh branch
    lastSyncStatus: null,
    lastSyncError: null,
    backfillStatus: null,
  });
  const previousId = process.env.GOOGLE_CLIENT_ID;
  const previousSecret = process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;

  await expect(
    subject.runGscProjectSync(deps, 'p1', stubLogger())
  ).rejects.toThrow();

  expect(gscConnectionStore.get('p1')?.lastSyncStatus).toBe('error');

  if (previousId !== undefined) {
    process.env.GOOGLE_CLIENT_ID = previousId;
  }
  if (previousSecret !== undefined) {
    process.env.GOOGLE_CLIENT_SECRET = previousSecret;
  }
});

test('completeGscOAuthCallback rejects a state mismatch before calling Google', async () => {
  validateAuthorizationCode.mockClear();
  await expect(
    subject.completeGscOAuthCallback(deps, {
      code: 'code',
      state: 'a',
      storedState: 'b',
      codeVerifier: 'verifier',
      projectId: 'p1',
    })
  ).rejects.toThrow('GSC OAuth state mismatch');
  expect(validateAuthorizationCode).not.toHaveBeenCalled();
});

test('completeGscOAuthCallback rejects an unknown project', async () => {
  await expect(
    subject.completeGscOAuthCallback(deps, {
      code: 'code',
      state: 'a',
      storedState: 'a',
      codeVerifier: 'verifier',
      projectId: 'proj_missing',
    })
  ).rejects.toThrow('Project not found for GSC connection');
});

test('completeGscOAuthCallback upserts the connection and returns the organizationId', async () => {
  gscConnectionStore.clear();
  const result = await subject.completeGscOAuthCallback(deps, {
    code: 'code',
    state: 'a',
    storedState: 'a',
    codeVerifier: 'verifier',
    projectId: 'p1',
  });

  expect(result).toEqual({ organizationId: 'org_1' });
  expect(gscConnectionStore.get('p1')).toMatchObject({ projectId: 'p1' });
});

test('resolveGscDateRange resolves through the org timezone and chart date helper', async () => {
  const result = await subject.resolveGscDateRange(deps, 'p1', { range: '7d' });
  expect(result).toEqual({ startDate: '2026-09-01', endDate: '2026-09-03' });
  expect(getSettingsForProject).toHaveBeenCalledWith(deps, 'p1');
});

test('getGscOverview returns the ClickHouse rows as-is', async () => {
  const rows = [
    { date: '2026-09-01', clicks: 1, impressions: 2, ctr: 0.5, position: 3 },
  ];
  ch.query.mockImplementationOnce(async () => ({
    json: async () => rows,
  }));

  const result = await subject.getGscOverview(
    deps,
    'p1',
    '2026-09-01',
    '2026-09-03'
  );
  expect(result).toEqual(rows);
});

test('gscGetOverviewCore aggregates the daily rows into a summary', async () => {
  ch.query.mockImplementationOnce(async () => ({
    json: async () => [
      {
        date: '2026-09-01',
        clicks: 10,
        impressions: 100,
        ctr: 0.1,
        position: 5,
      },
      {
        date: '2026-09-02',
        clicks: 20,
        impressions: 100,
        ctr: 0.2,
        position: 3,
      },
    ],
  }));

  const result = await subject.gscGetOverviewCore(deps, {
    projectId: 'p1',
    startDate: '2026-09-01',
    endDate: '2026-09-02',
  });

  expect(result.summary).toEqual({
    total_clicks: 30,
    total_impressions: 200,
    avg_ctr: 15,
    avg_position: 4,
  });
});

test('gscGetQueryOpportunitiesCore filters and scores mid-ranked, high-impression queries', async () => {
  ch.query.mockImplementationOnce(async () => ({
    json: async () => [
      // survives the impressions prefilter, but position 1 is out of the
      // opportunity band [4, 20] — excluded by computeOpportunities
      {
        query: 'too-high',
        clicks: 5,
        impressions: 500,
        ctr: 0.05,
        position: 1,
      },
      // excluded by the impressions prefilter itself (< 50)
      { query: 'too-rare', clicks: 1, impressions: 10, ctr: 0.05, position: 8 },
      // kept: mid-ranked, enough impressions
      {
        query: 'opportunity',
        clicks: 5,
        impressions: 200,
        ctr: 0.02,
        position: 8,
      },
    ],
  }));

  const result = await subject.gscGetQueryOpportunitiesCore(deps, {
    projectId: 'p1',
    startDate: '2026-09-01',
    endDate: '2026-09-02',
  });

  // total_analyzed counts everything past the impressions prefilter, before
  // computeOpportunities' own position/impressions band is applied.
  expect(result.total_analyzed).toBe(2);
  expect(result.opportunities).toHaveLength(1);
  expect(result.opportunities[0]?.query).toBe('opportunity');
});
