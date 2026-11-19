// The subject's functions take `ServiceDeps`, so `deps.db` is the fake below and
// no Prisma module mock is needed. The intra-package modules (store,
// referrer-spikes, explain) are `mock.module`'d, registered before the
// subject's first call.

import { beforeAll, expect, mock, test } from 'bun:test';
import { testCoreConfig } from '../../../test/config-fixture';
import { testServices } from '../../../test/service-deps';
import type { AppDeps, Buffers } from '../../context';

const listProjectIdsForCadence = mock(async () => ['p1', 'p2']);
const getProjectCreatedAt = mock(async () => null);
mock.module('./src/store', () => ({
  createInsightStore: () => ({
    listProjectIdsForCadence,
    getProjectCreatedAt,
  }),
}));

const executeRawCalls: unknown[] = [];
let executeRawReturns: number[] = [];
const $executeRaw = mock((..._args: unknown[]) => {
  executeRawCalls.push(_args);
  return Promise.resolve(executeRawReturns.shift() ?? 0);
});
// The explain cache is `deps.redis`, so the fake is a map on the scope — no
// `@openpanel/redis` module mock, which would replace that barrel process-wide
// for every other file in the run.
const redisStore = new Map<string, string>();
const redis = {
  get: mock((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
  setex: mock((key: string, _ttl: number, value: string) => {
    redisStore.set(key, value);
    return Promise.resolve();
  }),
};
// insight.service.ts never touches ClickHouse directly (it's PG-only, via
// $executeRaw above), so `deps.ch` stays unbuilt.
// One active project in an organization with an all-scope member, a member
// granted this project and a member granted another one.
const digestProject = { id: 'p1', name: 'Project', organizationId: 'org_1' };
const project = {
  findMany: mock(async (_query: unknown) => [
    { ...digestProject, organization: { subscriptionState: 'active' } },
  ]),
};
const projectInsight = { findMany: mock(async () => []) };
const member = {
  findMany: mock(async () => [
    {
      userId: 'u_all',
      role: 'member',
      projectScope: 'all',
      projects: [],
      user: { email: 'all@example.com' },
    },
    {
      userId: 'u_this',
      role: 'member',
      projectScope: 'selected',
      projects: [{ projectId: 'p1', level: null }],
      user: { email: 'this@example.com' },
    },
    {
      userId: 'u_other',
      role: 'member',
      projectScope: 'selected',
      projects: [{ projectId: 'p_other', level: null }],
      user: { email: 'other@example.com' },
    },
  ]),
};
const projectAccess = { findMany: mock(async () => []) };

const deps = {
  db: { $executeRaw, project, projectInsight, member, projectAccess },
  redis,
  config: testCoreConfig(),
} as unknown as import('../../services').ServiceDeps;

const overviewSummary = {
  unique_visitors: 10,
  total_sessions: 12,
  total_screen_views: 30,
  bounce_rate: 40,
};
const getAnalyticsOverviewCore = mock(async () => ({
  summary: overviewSummary,
}));
mock.module('../overview/overview.service', () => ({
  getAnalyticsOverviewCore,
}));

const generateWeeklyNarrative = mock(async () => 'A good week.');
mock.module('./src/narrative', () => ({ generateWeeklyNarrative }));

const sentEmails: { to: string; template: string }[] = [];
mock.module('../../clients/email', () => ({
  sendEmail: (template: string, options: { to: string }) => {
    sentEmails.push({ to: options.to, template });
    return Promise.resolve();
  },
}));

const spikesQuery = mock(async () => [
  { anchorDate: '2026-09-01', spikes: [] },
]);
mock.module('./src/referrer-spikes', () => ({
  getReferrerSpikes: spikesQuery,
}));

const generateInsightExplanation = mock(async () => ({
  summary: 'x',
  drivers: [],
  relatedReference: '',
  confidence: 'low' as const,
}));
mock.module('./src/explain', () => ({
  generateInsightExplanation,
}));

let subject: typeof import('./insight.service');
beforeAll(async () => {
  subject = await import('./insight.service');
});

test('listDailyInsightCandidates pairs every eligible project with the given date', async () => {
  const candidates = await subject.listDailyInsightCandidates(
    deps,
    '2026-09-03'
  );

  expect(listProjectIdsForCadence).toHaveBeenCalledWith('daily');
  expect(candidates).toEqual([
    { projectId: 'p1', date: '2026-09-03' },
    { projectId: 'p2', date: '2026-09-03' },
  ]);
});

test('cleanupStaleInsights stops each batch loop once a batch returns fewer than the page size', async () => {
  executeRawReturns = [5000, 5000, 1200, 5000, 0, 5000, 5000, 3];
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
  const result = await subject.cleanupStaleInsights(deps, logger);

  // suppressed: 5000+5000+1200 (stops <5000); closed: 5000+0 (stops <5000)
  expect(result.insights).toBe(5000 + 5000 + 1200 + 5000 + 0);
  // events: 5000+5000+3 (stops <5000)
  expect(result.events).toBe(5000 + 5000 + 3);
});

test('getReferrerSpikes delegates to the ClickHouse query', async () => {
  const input = {
    projectId: 'p1',
    filters: [],
    startDate: '2026-08-01',
    endDate: '2026-09-01',
    interval: 'day' as const,
    timezone: 'UTC',
  };
  const result = await subject.getReferrerSpikes(deps, input);

  expect(spikesQuery).toHaveBeenCalledWith(deps, input);
  expect(result).toEqual([{ anchorDate: '2026-09-01', spikes: [] }]);
});

test('explainInsight is a cache-aside over the AI call, keyed by the caller-supplied cacheKey', async () => {
  const input = {
    insight: { title: 't', dimension: 'd', window: 'yesterday' },
    breakdowns: [],
    references: [],
  };

  const first = await subject.explainInsight(
    deps,
    input,
    'insight-explain:i1:100'
  );
  expect(generateInsightExplanation).toHaveBeenCalledTimes(1);
  expect(first?.summary).toBe('x');

  // Second call with the same key is served from the cache, not the LLM.
  const second = await subject.explainInsight(
    deps,
    input,
    'insight-explain:i1:100'
  );
  expect(generateInsightExplanation).toHaveBeenCalledTimes(1);
  expect(second).toEqual(first);

  // The cache used is the one the scope handed in, not a module-level connection.
  expect(redis.setex).toHaveBeenCalledTimes(1);
  expect(redis.get).toHaveBeenCalledTimes(2);
});

test('createInsightService binds every InsightService method', () => {
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
  const service = subject.createInsightService(
    {
      auth: null,
      db: undefined as unknown as AppDeps['db'],
      prisma: undefined as unknown as AppDeps['prisma'],
      ch: undefined as unknown as AppDeps['ch'],
      redis: undefined as unknown as AppDeps['redis'],
      clients: undefined as unknown as AppDeps['clients'],
      buffers: undefined as unknown as Buffers,
      logger,
      queues:
        undefined as unknown as import('../../jobs.registry').QueueProducers,
      config: testCoreConfig(),
    },
    testServices()
  );

  for (const method of [
    'listDailyInsightCandidates',
    'runProjectInsights',
    'cleanupStaleInsights',
    'sendWeeklyDigests',
    'previewWeeklyDigest',
    'listInsights',
    'listAllInsights',
    'explainInsight',
    'getReferrerSpikes',
  ] as const) {
    expect(typeof service[method]).toBe('function');
  }
});

test('sendWeeklyDigests mails only the members who can open the project', async () => {
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

  const result = await subject.sendWeeklyDigests(deps, logger);

  expect(getAnalyticsOverviewCore).toHaveBeenCalledTimes(2);
  expect(member.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { organizationId: 'org_1', user: { deletedAt: null } },
    })
  );
  expect(result).toEqual({ projects: 1, sent: 1 });
  expect(sentEmails).toEqual([
    { to: 'all@example.com', template: 'weekly-digest' },
    { to: 'this@example.com', template: 'weekly-digest' },
  ]);
});

test.each([
  { selfHosted: true, state: 'self_hosted', sent: 1 },
  { selfHosted: false, state: 'active', sent: 1 },
  { selfHosted: false, state: 'trialing', sent: 1 },
  { selfHosted: false, state: 'expired', sent: 0 },
  { selfHosted: false, state: 'canceled', sent: 0 },
  { selfHosted: false, state: 'self_hosted', sent: 0 },
])('weekly digest eligibility: %j', async ({ selfHosted, state, sent }) => {
  project.findMany.mockClear();
  project.findMany.mockResolvedValueOnce([
    { ...digestProject, organization: { subscriptionState: state } },
  ]);
  sentEmails.length = 0;
  getAnalyticsOverviewCore.mockClear();
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
  const result = await subject.sendWeeklyDigests(
    { ...deps, config: testCoreConfig({ selfHosted }) },
    logger
  );

  expect(project.findMany).toHaveBeenCalledTimes(1);
  const query = project.findMany.mock.calls[0]![0] as {
    where: Record<string, unknown>;
  };
  expect(query.where).toEqual({
    deleteAt: null,
    eventsCount: { gt: expect.any(Number) },
    ...(selfHosted
      ? {}
      : {
          organization: { subscriptionStatus: { in: ['active', 'trialing'] } },
        }),
  });
  expect(result).toEqual({ projects: 1, sent });
  expect(getAnalyticsOverviewCore).toHaveBeenCalledTimes(sent * 2);
  expect(sentEmails).toEqual(
    sent
      ? [
          { to: 'all@example.com', template: 'weekly-digest' },
          { to: 'this@example.com', template: 'weekly-digest' },
        ]
      : []
  );
});
