import { expect, test } from 'bun:test';
import { queues } from './jobs.registry';

// V1's `defaultJobOptions`, verbatim from packages/queue/src/queues.ts.
// ADR-005's acceptance note: retry and retention values port as-is, defects
// included — five queues that never retry, four with unbounded failed sets.
const V1_DEFAULTS = {
  sessions: { removeOnComplete: true },
  cron: { removeOnComplete: 10 },
  notification: { removeOnComplete: 10 },
  import: { removeOnComplete: 10, removeOnFail: 50 },
  insights: { removeOnComplete: 100 },
  gsc: { removeOnComplete: 50, removeOnFail: 100 },
  cohortCompute: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 86_400, count: 100 },
  },
} as const;

// apps/worker/src/boot-workers.ts:209-277 — `getConcurrencyFor(name, default)`.
const V1_CONCURRENCY = {
  sessions: 1,
  cron: 1,
  notification: 1,
  import: 1,
  insights: 5,
  gsc: 5,
  cohortCompute: 2,
} as const;

test('the registry declares the seven queues, keyed by their Redis names', () => {
  expect(Object.keys(queues).sort()).toEqual([
    'cohortCompute',
    'cron',
    'gsc',
    'import',
    'insights',
    'notification',
    'sessions',
  ]);

  for (const [key, definition] of Object.entries(queues)) {
    expect(definition.name).toBe(key);
  }
});

test('every queue carries V1 retry and retention values unchanged', () => {
  for (const [key, defaults] of Object.entries(V1_DEFAULTS)) {
    expect(queues[key as keyof typeof queues].defaults).toEqual(defaults);
  }
});

test('every queue carries its V1 default concurrency', () => {
  for (const [key, concurrency] of Object.entries(V1_CONCURRENCY)) {
    expect(queues[key as keyof typeof queues].worker?.concurrency).toBe(
      concurrency
    );
  }
});

test('every queue has a compat hook — the cutover has no drain step', () => {
  for (const definition of Object.values(queues)) {
    expect(typeof definition.compat).toBe('function');
  }
});
