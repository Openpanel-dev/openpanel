// insight.service.ts's db/ch access is lazy (`await import(...)` inside each
// function — see the file's header), which is exactly what makes
// `mock.module` work here with no import-time side effects to race: every
// mock below is registered before the subject's first call, not before its
// (side-effect-free) import.

import { beforeAll, expect, mock, test } from 'bun:test';

const listProjectIdsForCadence = mock(async () => ['p1', 'p2']);
const getProjectCreatedAt = mock(async () => null);
mock.module('./src/store', () => ({
  insightStore: { listProjectIdsForCadence, getProjectCreatedAt },
}));

const executeRawCalls: unknown[] = [];
let executeRawReturns: number[] = [];
const $executeRaw = mock((..._args: unknown[]) => {
  executeRawCalls.push(_args);
  return Promise.resolve(executeRawReturns.shift() ?? 0);
});
mock.module('@openpanel/db/src/prisma-client', () => ({
  db: { $executeRaw },
}));

// `originalCh`/`chQuery`/`TABLE_NAMES` are unused here but included because
// `mock.module` replaces this specifier process-wide (bun runs every test
// file in one shared module registry without `--isolate` — see AGENTS.md) —
// gsc.service.test.ts mocks the same path, so both factories must be a
// superset of every consumer's needs, whichever one ends up registered last.
mock.module('@openpanel/db/src/clickhouse/client', () => ({
  ch: {},
  originalCh: { query: mock(async () => ({ json: async () => [] })), insert: mock(async () => undefined) },
  chQuery: mock(async () => []),
  TABLE_NAMES: { sessions: 'sessions' },
}));

const spikesQuery = mock(async () => [
  { anchorDate: '2026-09-01', spikes: [] },
]);
mock.module('./src/referrer-spikes', () => ({
  getReferrerSpikes: spikesQuery,
}));

const legacyGenerateInsights = mock(async () => [
  { type: 'traffic_spike', message: 'test', data: {} },
]);
mock.module('./src/legacy-scan', () => ({
  InsightsService: class {
    generateInsights = legacyGenerateInsights;
  },
}));

const generateInsightExplanation = mock(async () => ({
  summary: 'x',
  drivers: [],
  relatedReference: '',
  confidence: 'low' as const,
}));
mock.module('../../clients/ai/explain', () => ({
  generateInsightExplanation,
}));

const redisStore = new Map<string, string>();
const getRedisCache = mock(() => ({
  get: mock((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
  setex: mock((key: string, _ttl: number, value: string) => {
    redisStore.set(key, value);
    return Promise.resolve();
  }),
}));
// `cacheable` is unused here but included for the same cross-file
// mock.module reason as the clickhouse/client mock above.
mock.module('@openpanel/redis', () => ({
  getRedisCache,
  cacheable: <T>(fn: T) => fn,
}));

let subject: typeof import('./insight.service');
beforeAll(async () => {
  subject = await import('./insight.service');
});

test('listDailyInsightCandidates pairs every eligible project with the given date', async () => {
  const candidates = await subject.listDailyInsightCandidates('2026-09-03');

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
  const result = await subject.cleanupStaleInsights(logger);

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
  const result = await subject.getReferrerSpikes(input);

  expect(spikesQuery).toHaveBeenCalledWith(input);
  expect(result).toEqual([{ anchorDate: '2026-09-01', spikes: [] }]);
});

test('scanLegacyInsights delegates to the pre-engine detector, kept for parity', async () => {
  const result = await subject.scanLegacyInsights('p1');

  expect(legacyGenerateInsights).toHaveBeenCalledWith('p1');
  expect(result).toEqual([
    { type: 'traffic_spike', message: 'test', data: {} },
  ]);
});

test('explainInsight is a cache-aside over the AI call, keyed by the caller-supplied cacheKey', async () => {
  const input = {
    insight: { title: 't', dimension: 'd', window: 'yesterday' },
    breakdowns: [],
    references: [],
  };

  const first = await subject.explainInsight(input, 'insight-explain:i1:100');
  expect(generateInsightExplanation).toHaveBeenCalledTimes(1);
  expect(first?.summary).toBe('x');

  // Second call with the same key is served from the cache, not the LLM.
  const second = await subject.explainInsight(input, 'insight-explain:i1:100');
  expect(generateInsightExplanation).toHaveBeenCalledTimes(1);
  expect(second).toEqual(first);
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
  const service = subject.createInsightService({
    db: undefined,
    ch: undefined,
    redis: undefined,
    clients: undefined,
    buffers: undefined,
    logger,
    queues:
      undefined as unknown as import('../../jobs.registry').QueueProducers,
  });

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
