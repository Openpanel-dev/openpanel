// M10-009: the subject's functions take `ServiceDeps`, so `deps.db` IS the
// fake below and no Prisma module mock is needed. The intra-package modules
// (store, referrer-spikes, legacy-scan) are still `mock.module`'d — that works
// here with no import-time side effects to race because every mock is
// registered before the subject's first call, not before its import.

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
// M15-114: the explain cache is `deps.redis` (ADR-022 R16), so the fake is a
// map on the scope — no `@openpanel/redis` module mock, which would replace
// that barrel process-wide for every other file in the run.
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
const deps = {
  db: { $executeRaw },
  redis,
  config: testCoreConfig(),
} as unknown as import('../../services').ServiceDeps;

const spikesQuery = mock(async () => [
  { anchorDate: '2026-09-01', spikes: [] },
]);
mock.module('./src/referrer-spikes', () => ({
  getReferrerSpikes: spikesQuery,
}));

const LEGACY_SPIKE = {
  type: 'traffic_spike',
  message: 'test',
  // A `TrafficSpikeResult` — `Insight.data` is the union of the ten detector
  // result shapes, not `any`.
  data: {
    referrer_name: 'instagram.com',
    date: '2026-09-01',
    visitor_count: 120,
    avg_previous_7_days: 30,
  },
};
const legacyGenerateInsights = mock(async () => [LEGACY_SPIKE]);
mock.module('./src/legacy-scan', () => ({
  createLegacyInsightsScanner: () => ({
    generateInsights: legacyGenerateInsights,
  }),
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

test('scanLegacyInsights delegates to the pre-engine detector, kept for parity', async () => {
  const result = await subject.scanLegacyInsights(deps, 'p1');

  expect(legacyGenerateInsights).toHaveBeenCalledWith('p1');
  expect(result).toEqual([LEGACY_SPIKE]);
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

  // The cache it read and wrote is the one the scope handed it, not a
  // module-level `getRedisCache()` connection nobody closes (R16).
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
    'scanLegacyInsights',
  ] as const) {
    expect(typeof service[method]).toBe('function');
  }
});
