import { expect, test } from 'bun:test';
import { PING_SCHEDULE, schedulersFromRegistry } from './jobs/schedulers';
import { queues } from './jobs.registry';

// Byte-identity snapshot; `jobs/schedulers.test.ts` has the matching id-level check.
const GOLDEN_SCHEDULER_IDS = [
  'cohortRefresh',
  'dataHealth',
  'delete',
  'flushEvents',
  'flushExports',
  'flushGroups',
  'flushProfileBackfill',
  'flushProfiles',
  'flushReplay',
  'flushSessions',
  'gscSync',
  'insightCleanup',
  'insightsDaily',
  'onboarding',
  'ping',
  'salt',
  'sessionReaper',
  'sessionVacuum',
  'weeklyDigest',
  'windDown',
].sort();

// Retry and retention values pinned as they are: five queues never retry and
// four have unbounded failed sets.
const PINNED_DEFAULTS = {
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

const PINNED_CONCURRENCY = {
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

test('every queue keeps its pinned retry and retention values', () => {
  for (const [key, defaults] of Object.entries(PINNED_DEFAULTS)) {
    expect(queues[key as keyof typeof queues].defaults).toEqual(defaults);
  }
});

test('every queue keeps its pinned default concurrency', () => {
  for (const [key, concurrency] of Object.entries(PINNED_CONCURRENCY)) {
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

// The BullMQ job *name* IS the registry key (defineQueue stamps it) and
// legacyCompat.insights discriminates on it (jobs/compat.ts); this pins the two.
test('the insights queue carries the insight module job', () => {
  expect(Object.keys(queues.insights.jobs)).toEqual(['insightsProject']);
  expect(queues.insights.jobs.insightsProject).toMatchObject({
    queue: 'insights',
    name: 'insightsProject',
  });
});

// `ping` (misc.jobs.ts) is the only conditional scheduler: `startSchedulers`
// adds it only when SELF_HOSTED && production, but its HANDLER is always
// registered so a scheduled run always has somewhere to land.
test('the cron queue carries the insight module cron fragment', () => {
  expect(Object.keys(queues.cron.jobs).sort()).toEqual(
    [
      'cohortRefresh',
      'dataHealth',
      'delete',
      'flushExports',
      'flushEvents',
      'flushGroups',
      'flushProfileBackfill',
      'flushProfiles',
      'flushReplay',
      'flushSessions',
      'gscSync',
      'insightCleanup',
      'insightsDaily',
      'onboarding',
      'ping',
      'salt',
      'sessionReaper',
      'sessionVacuum',
      'weeklyDigest',
      'windDown',
    ].sort()
  );
  for (const name of ['insightsDaily', 'insightCleanup', 'weeklyDigest']) {
    expect(
      queues.cron.jobs[name as keyof typeof queues.cron.jobs]
    ).toMatchObject({ queue: 'cron', name });
  }
});

// legacyCompat.gsc discriminates on these exact names (jobs/compat.ts).
test('the gsc queue carries the gsc module jobs', () => {
  expect(Object.keys(queues.gsc.jobs).sort()).toEqual(
    ['gscProjectBackfill', 'gscProjectSync'].sort()
  );
  for (const name of ['gscProjectSync', 'gscProjectBackfill']) {
    expect(queues.gsc.jobs[name as keyof typeof queues.gsc.jobs]).toMatchObject(
      { queue: 'gsc', name }
    );
  }
});

test('the cron queue carries the gsc module cron fragment', () => {
  expect(queues.cron.jobs.gscSync).toMatchObject({
    queue: 'cron',
    name: 'gscSync',
  });
});

// legacyCompat.cohortCompute discriminates on a bare `{cohortId}` (jobs/compat.ts).
test('the cohortCompute queue carries the cohort module job', () => {
  expect(Object.keys(queues.cohortCompute.jobs)).toEqual(['cohortCompute']);
  expect(queues.cohortCompute.jobs.cohortCompute).toMatchObject({
    queue: 'cohortCompute',
    name: 'cohortCompute',
  });
});

test('the cron queue carries the cohort module cron fragment', () => {
  expect(queues.cron.jobs.cohortRefresh).toMatchObject({
    queue: 'cron',
    name: 'cohortRefresh',
  });
});

test('the cron queue carries the organization module cron fragment', () => {
  expect(queues.cron.jobs.delete).toMatchObject({
    queue: 'cron',
    name: 'delete',
  });
});

test('the cron queue carries the onboarding module cron fragment', () => {
  expect(queues.cron.jobs.onboarding).toMatchObject({
    queue: 'cron',
    name: 'onboarding',
  });
});

// legacyCompat.sessions maps the legacy `createSessionEnd` job onto this name;
// the scheduler ids double as the job names.
test('the sessions queue carries the session module job', () => {
  expect(Object.keys(queues.sessions.jobs)).toEqual(['session']);
  expect(queues.sessions.jobs.session).toMatchObject({
    queue: 'sessions',
    name: 'session',
  });
});

test('the cron queue carries the session module cron fragment', () => {
  for (const name of ['sessionReaper', 'sessionVacuum']) {
    expect(
      queues.cron.jobs[name as keyof typeof queues.cron.jobs]
    ).toMatchObject({ queue: 'cron', name });
  }
});

// No cron fragment: imports are always user-triggered. legacyCompat.import
// discriminates on this name (jobs/compat.ts).
test('the import queue carries the import module job', () => {
  expect(Object.keys(queues.import.jobs)).toEqual(['import']);
  expect(queues.import.jobs.import).toMatchObject({
    queue: 'import',
    name: 'import',
  });
});

// No cron fragment: notifications are triggered by a rule match. legacyCompat.notification
// discriminates on this name (jobs/compat.ts).
test('the notification queue carries the notification module job', () => {
  expect(Object.keys(queues.notification.jobs)).toEqual(['sendNotification']);
  expect(queues.notification.jobs.sendNotification).toMatchObject({
    queue: 'notification',
    name: 'sendNotification',
  });
});

test('the cron queue derives the golden 20 scheduler ids', () => {
  const derivedIds = [
    ...schedulersFromRegistry(queues.cron).map((s) => s.id),
    PING_SCHEDULE.id,
  ].sort();

  expect(derivedIds).toEqual(GOLDEN_SCHEDULER_IDS);
});
