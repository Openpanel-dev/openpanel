// gsc.service.ts's db/ch access is lazy (`await import(...)` inside each
// function — see the file's header), which is exactly what makes
// `mock.module` work here with no import-time side effects to race: every
// mock below is registered before the subject's first call, not before its
// (side-effect-free) import.

import { afterAll, beforeAll, expect, mock, test } from 'bun:test';

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
};

// Spread the real module — see the clickhouse/client mock below for why a
// partial factory here is a process-wide hazard, not a local one.
const actualPrismaClient = await import('@openpanel/db/src/prisma-client');
mock.module('@openpanel/db/src/prisma-client', () => ({
  ...actualPrismaClient,
  db: { gscConnection, project },
}));

const chQuery = mock(async () => [] as unknown[]);
const originalCh = {
  query: mock(async () => ({ json: async () => [] as unknown[] })),
  insert: mock(async () => undefined),
};
// Spread the real module rather than hand-listing every export: `mock.module`
// replaces this specifier process-wide (bun runs every test file in one
// shared module registry without `--isolate` — see AGENTS.md), so a partial
// factory here silently breaks unrelated consumers (insight/cohort/import
// tests and now the mcp module's) that import an export this file never
// overrides. `ch` itself is one such export: gsc.service.ts never calls it
// (it goes through `originalCh`/`chQuery` — see the file's header), so it is
// spread wholesale rather than replaced, keeping `query` intact for every
// *other* consumer of this same live-bound singleton (e.g. `@openpanel/db`'s
// `OverviewService`/`PagesService`, constructed once at that module's own
// load time) for the rest of the process.
// A plain-object snapshot, not the live import binding: once `mock.module`
// below swaps this specifier, `actualClickhouseClient.chQuery` (a namespace
// binding) reflects the *mocked* value too, so restoring via
// `actualClickhouseClient` itself in `afterAll` is a no-op — it just spreads
// back whatever is currently mocked. Snapshotting into a plain object first
// keeps a real, frozen-in-time copy to restore to.
const actualClickhouseClient = await import(
  '@openpanel/db/src/clickhouse/client'
);
const realClickhouseClient = { ...actualClickhouseClient };
mock.module('@openpanel/db/src/clickhouse/client', () => ({
  ...realClickhouseClient,
  originalCh,
  chQuery,
}));

// `chQuery` above is a fake stuck in place for the rest of the process once
// this file's tests finish (`mock.module` has no per-file scope without
// `--isolate` — see AGENTS.md): the mcp module's integration suite calls the
// real `chQuery` against a live ClickHouse and silently got `[]` back from
// this file's leftover mock. Restore the real snapshot so whichever file
// runs next sees real behavior again.
afterAll(() => {
  mock.module(
    '@openpanel/db/src/clickhouse/client',
    () => realClickhouseClient
  );
});

// Bypasses the Redis cache-aside entirely — `getGscCannibalization`'s own
// logic is exercised directly, its caching is @openpanel/redis's concern.
// `getRedisCache` is unused here but included for the same cross-file
// mock.module reason as above.
mock.module('@openpanel/redis', () => ({
  cacheable: <T>(fn: T) => fn,
  getRedisCache: () => ({
    get: async () => null,
    setex: async () => undefined,
  }),
}));

const validateAuthorizationCode = mock(async () => ({
  accessToken: () => 'google-access-token',
  hasRefreshToken: () => true,
  refreshToken: () => 'google-refresh-token',
  accessTokenExpiresAt: () => new Date('2026-09-04T00:00:00.000Z'),
}));
mock.module('../auth/auth.service', () => ({
  googleGsc: { validateAuthorizationCode },
}));

const getSettingsForProject = mock(async () => ({ timezone: 'UTC' }));
// Spread the real module — see the clickhouse/client mock above for why a
// partial factory here is a process-wide hazard, not a local one.
const actualOrganizationService = await import(
  '@openpanel/db/src/services/organization.service'
);
mock.module('@openpanel/db/src/services/organization.service', () => ({
  ...actualOrganizationService,
  getSettingsForProject,
}));

const getChartStartEndDate = mock(() => ({
  startDate: '2026-09-01T00:00:00.000Z',
  endDate: '2026-09-03T00:00:00.000Z',
}));
// Spread the real module — see the clickhouse/client mock above for why a
// partial factory here is a process-wide hazard, not a local one.
const actualDateService = await import(
  '@openpanel/db/src/services/date.service'
);
mock.module('@openpanel/db/src/services/date.service', () => ({
  ...actualDateService,
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

  const result = await subject.listGscConnectionsForSync();
  expect(result).toEqual([{ projectId: 'p1' }]);
});

test('getGscConnection returns null when no connection exists', async () => {
  gscConnectionStore.clear();
  const result = await subject.getGscConnection('missing');
  expect(result).toBeNull();
});

test('selectGscSite throws TRPCNotFoundError when the connection is missing', async () => {
  gscConnectionStore.clear();
  await expect(
    subject.selectGscSite('missing', 'https://example.com')
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

  await subject.selectGscSite('p1', 'https://example.com');

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

  await subject.disconnectGscConnection('p1');
  expect(gscConnectionStore.has('p1')).toBe(false);
});

test('runGscProjectSync skips silently when there is no connected site', async () => {
  gscConnectionStore.clear();
  await expect(
    subject.runGscProjectSync('missing', stubLogger())
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

  await expect(subject.runGscProjectSync('p1', stubLogger())).rejects.toThrow();

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
    subject.completeGscOAuthCallback({
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
    subject.completeGscOAuthCallback({
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
  const result = await subject.completeGscOAuthCallback({
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
  const result = await subject.resolveGscDateRange('p1', { range: '7d' });
  expect(result).toEqual({ startDate: '2026-09-01', endDate: '2026-09-03' });
  expect(getSettingsForProject).toHaveBeenCalledWith('p1');
});

test('getGscOverview returns the ClickHouse rows as-is', async () => {
  const rows = [
    { date: '2026-09-01', clicks: 1, impressions: 2, ctr: 0.5, position: 3 },
  ];
  originalCh.query.mockImplementationOnce(async () => ({
    json: async () => rows,
  }));

  const result = await subject.getGscOverview('p1', '2026-09-01', '2026-09-03');
  expect(result).toEqual(rows);
});

test('gscGetOverviewCore aggregates the daily rows into a summary', async () => {
  originalCh.query.mockImplementationOnce(async () => ({
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

  const result = await subject.gscGetOverviewCore({
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
  originalCh.query.mockImplementationOnce(async () => ({
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

  const result = await subject.gscGetQueryOpportunitiesCore({
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
