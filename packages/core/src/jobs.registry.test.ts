import { expect, test } from 'bun:test';
import { PING_SCHEDULE, schedulersFromRegistry } from './jobs/schedulers';
import { queues } from './jobs.registry';

// Byte-identity snapshot — see `jobs/schedulers.test.ts` for the matching
// id-level check.
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

// Retry and retention values kept as-is, defects included — five queues
// that never retry, four with unbounded failed sets.
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

// The insight module's job — the BullMQ job *name* IS the registry key
// (defineQueue stamps it), and legacyCompat.insights already discriminates on
// this exact name (jobs/compat.ts), so this pins the two in agreement.
test('the insights queue carries the insight module job', () => {
  expect(Object.keys(queues.insights.jobs)).toEqual(['insightsProject']);
  expect(queues.insights.jobs.insightsProject).toMatchObject({
    queue: 'insights',
    name: 'insightsProject',
  });
});

// The insight module's cron fragment (insight.jobs.ts), spread into the one
// cron queue. `ping` (misc.jobs.ts) is the only conditional scheduler — it's
// added by `startSchedulers` only when SELF_HOSTED && production
// (jobs/schedulers.ts's `PING_SCHEDULE`), but its job HANDLER is always
// registered here so a scheduled run always has somewhere to land.
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

// The gsc module's own queue job, plus its cron fan-out fragment.
// legacyCompat.gsc already discriminates on these exact names (jobs/compat.ts),
// so this pins the two in agreement.
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

// The cohort module's own queue job, plus its cron fan-out fragment.
// legacyCompat.cohortCompute already discriminates on a bare `{cohortId}`
// (jobs/compat.ts), so this pins the two in agreement.
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

// The organization module's `delete` cron fragment.
test('the cron queue carries the organization module cron fragment', () => {
  expect(queues.cron.jobs.delete).toMatchObject({
    queue: 'cron',
    name: 'delete',
  });
});

// The onboarding module's own cron fragment.
test('the cron queue carries the onboarding module cron fragment', () => {
  expect(queues.cron.jobs.onboarding).toMatchObject({
    queue: 'cron',
    name: 'onboarding',
  });
});

// The session module's own job (legacyCompat.sessions maps the legacy
// `createSessionEnd` job onto this exact name) and its reaper/vacuum cron
// fragment — the scheduler ids double as the job names.
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

// The import module's own job. No cron fragment — imports are always
// user-triggered (import.rpc.ts's create/retry), unlike gsc/cohort/insight.
// legacyCompat.import already discriminates on this exact name
// (jobs/compat.ts), so this pins the two in agreement.
test('the import queue carries the import module job', () => {
  expect(Object.keys(queues.import.jobs)).toEqual(['import']);
  expect(queues.import.jobs.import).toMatchObject({
    queue: 'import',
    name: 'import',
  });
});

// The notification module's own job. No cron fragment — notifications are
// always triggered by a rule match, never scheduled. legacyCompat.notification
// already discriminates on this exact name (jobs/compat.ts), so this pins the
// two in agreement.
test('the notification queue carries the notification module job', () => {
  expect(Object.keys(queues.notification.jobs)).toEqual(['sendNotification']);
  expect(queues.notification.jobs.sendNotification).toMatchObject({
    queue: 'notification',
    name: 'sendNotification',
  });
});

// The join between a cron job and its schedule is enforced by the type
// system (`defineQueue`'s overload for the `cron` queue requires every job
// on it to declare `cron`, a schedule or explicit `null`), so this property
// can no longer drift — it is true by construction, not by a test walking
// both registries.
test('the cron queue derives the golden 20 scheduler ids', () => {
  const derivedIds = [
    ...schedulersFromRegistry(queues.cron).map((s) => s.id),
    PING_SCHEDULE.id,
  ].sort();

  expect(derivedIds).toEqual(GOLDEN_SCHEDULER_IDS);
});
