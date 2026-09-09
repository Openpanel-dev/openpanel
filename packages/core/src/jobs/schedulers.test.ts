import { expect, test } from 'bun:test';
import { CRON_SCHEDULES } from '../jobs.registry';
import type { Logger } from '../logger';
import {
  PING_SCHEDULE,
  type SchedulerQueue,
  startSchedulers,
} from './schedulers';

// Byte-identity snapshot, mirroring
// `verification/golden/queue-keys/scheduler-ids.json` — which the
// controller's `check.sh` independently recomputes from V1's
// `packages/queue/src/queues.ts` (CronQueuePayload union) and
// `apps/worker/src/boot-cron.ts`. Both sides pin the same 20 ids, including
// the three ADR-005 fixed omissions (ADR-005 acceptance note).
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

function stubLogger(): Logger {
  const noop = () => undefined;
  const logger: Logger = {
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

/** In-memory stand-in for a BullMQ queue's scheduler surface. */
function fakeQueue(options?: {
  existingSchedulerKeys?: string[];
  conflictOnce?: Set<string>;
  conflictingJobs?: { id: string }[];
}): SchedulerQueue & {
  calls: {
    upserted: { id: string; data: unknown }[];
    removedSchedulers: string[];
    removedJobs: string[];
  };
} {
  const schedulerKeys = new Set(options?.existingSchedulerKeys ?? []);
  const conflictOnce = new Set(options?.conflictOnce ?? []);
  const remainingConflictingJobs = [...(options?.conflictingJobs ?? [])];
  const calls = {
    upserted: [] as { id: string; data: unknown }[],
    removedSchedulers: [] as string[],
    removedJobs: [] as string[],
  };

  return {
    calls,
    async getJobSchedulers() {
      return [...schedulerKeys].map((key) => ({ key }));
    },
    async upsertJobScheduler(id, _repeatOpts, jobTemplate) {
      if (conflictOnce.has(id)) {
        conflictOnce.delete(id);
        throw new Error('Job scheduler job ID already exists');
      }
      schedulerKeys.add(id);
      calls.upserted.push({ id, data: jobTemplate?.data });
      return undefined;
    },
    async removeJobScheduler(id) {
      calls.removedSchedulers.push(id);
      return schedulerKeys.delete(id);
    },
    async getJobs(_types) {
      return remainingConflictingJobs.splice(0).map((job) => ({
        id: job.id,
        remove: async () => {
          calls.removedJobs.push(job.id);
        },
      }));
    },
  };
}

test('the golden scheduler ids are reproduced byte-for-byte', () => {
  const allIds = [...CRON_SCHEDULES.map((s) => s.id), PING_SCHEDULE.id].sort();

  expect(allIds).toHaveLength(20);
  expect(allIds).toEqual(GOLDEN_SCHEDULER_IDS);
});

test('the three ADR-005 fixed omissions are present', () => {
  const ids = new Set(CRON_SCHEDULES.map((s) => s.id));
  expect(ids.has('dataHealth')).toBe(true);
  expect(ids.has('windDown')).toBe(true);
  expect(ids.has('flushExports')).toBe(true);
});

test('ping is excluded by default — neither self-hosted nor production', async () => {
  const queue = fakeQueue();

  await startSchedulers({
    queue,
    flags: { selfHosted: false, production: false },
    logger: stubLogger(),
    schedulers: CRON_SCHEDULES,
  });

  const upsertedIds = queue.calls.upserted.map((u) => u.id).sort();
  expect(upsertedIds).toHaveLength(19);
  expect(upsertedIds).not.toContain('ping');
});

test('ping is excluded when self-hosted but not production', async () => {
  const queue = fakeQueue();

  await startSchedulers({
    queue,
    flags: { selfHosted: true, production: false },
    logger: stubLogger(),
    schedulers: CRON_SCHEDULES,
  });

  expect(queue.calls.upserted.map((u) => u.id)).not.toContain('ping');
});

test('ping is excluded when production but not self-hosted', async () => {
  const queue = fakeQueue();

  await startSchedulers({
    queue,
    flags: { selfHosted: false, production: true },
    logger: stubLogger(),
    schedulers: CRON_SCHEDULES,
  });

  expect(queue.calls.upserted.map((u) => u.id)).not.toContain('ping');
});

test('ping is included only when self-hosted AND production', async () => {
  const queue = fakeQueue();

  await startSchedulers({
    queue,
    flags: { selfHosted: true, production: true },
    logger: stubLogger(),
    schedulers: CRON_SCHEDULES,
  });

  const upsertedIds = queue.calls.upserted.map((u) => u.id).sort();
  expect(upsertedIds).toHaveLength(20);
  expect(upsertedIds).toEqual(GOLDEN_SCHEDULER_IDS);
});

test('every upsert carries envelope-shaped data, not a legacy {type} shape', async () => {
  const queue = fakeQueue();

  await startSchedulers({
    queue,
    flags: { selfHosted: false, production: false },
    logger: stubLogger(),
    schedulers: [{ id: 'salt', schedule: { pattern: '0 0 * * *' } }],
  });

  expect(queue.calls.upserted).toEqual([
    { id: 'salt', data: { payload: null, meta: {} } },
  ]);
});

test('a scheduler no longer declared is pruned', async () => {
  const queue = fakeQueue({
    existingSchedulerKeys: ['salt', 'aRemovedJob'],
  });

  await startSchedulers({
    queue,
    flags: { selfHosted: false, production: false },
    logger: stubLogger(),
    schedulers: [{ id: 'salt', schedule: { pattern: '0 0 * * *' } }],
  });

  expect(queue.calls.removedSchedulers).toEqual(['aRemovedJob']);
});

test('a declared scheduler that already exists is left alone by pruning', async () => {
  const queue = fakeQueue({ existingSchedulerKeys: ['salt', 'delete'] });

  await startSchedulers({
    queue,
    flags: { selfHosted: false, production: false },
    logger: stubLogger(),
    schedulers: [
      { id: 'salt', schedule: { pattern: '0 0 * * *' } },
      { id: 'delete', schedule: { pattern: '0 * * * *' } },
    ],
  });

  expect(queue.calls.removedSchedulers).toEqual([]);
});

test('a conflicting upsert is cleaned up and retried, not left failed', async () => {
  const queue = fakeQueue({
    conflictOnce: new Set(['salt']),
    conflictingJobs: [{ id: 'repeat:salt:1700000000000' }],
  });

  await startSchedulers({
    queue,
    flags: { selfHosted: false, production: false },
    logger: stubLogger(),
    schedulers: [{ id: 'salt', schedule: { pattern: '0 0 * * *' } }],
  });

  // Cleanup removed the stale scheduler-created job and the scheduler
  // itself, then the retry succeeded.
  expect(queue.calls.removedJobs).toEqual(['repeat:salt:1700000000000']);
  expect(queue.calls.removedSchedulers).toContain('salt');
  expect(queue.calls.upserted.map((u) => u.id)).toEqual(['salt']);
});

test('a conflicting job belonging to a different scheduler is left alone', async () => {
  const queue = fakeQueue({
    conflictOnce: new Set(['salt']),
    conflictingJobs: [{ id: 'repeat:delete:1700000000000' }],
  });

  await startSchedulers({
    queue,
    flags: { selfHosted: false, production: false },
    logger: stubLogger(),
    schedulers: [{ id: 'salt', schedule: { pattern: '0 0 * * *' } }],
  });

  expect(queue.calls.removedJobs).toEqual([]);
  expect(queue.calls.upserted.map((u) => u.id)).toEqual(['salt']);
});

test('a non-conflict upsert error is logged, not thrown — one bad scheduler must not block the rest', async () => {
  const queue = fakeQueue();
  const originalUpsert = queue.upsertJobScheduler.bind(queue);
  queue.upsertJobScheduler = async (id, repeatOpts, jobTemplate) => {
    if (id === 'salt') {
      throw new Error('ECONNRESET');
    }
    return originalUpsert(id, repeatOpts, jobTemplate);
  };

  await expect(
    startSchedulers({
      queue,
      flags: { selfHosted: false, production: false },
      logger: stubLogger(),
      schedulers: [
        { id: 'salt', schedule: { pattern: '0 0 * * *' } },
        { id: 'delete', schedule: { pattern: '0 * * * *' } },
      ],
    })
  ).resolves.toBeUndefined();

  expect(queue.calls.upserted.map((u) => u.id)).toEqual(['delete']);
});

test('idempotent across replicas — a second boot converges on the same set, no duplicates', async () => {
  const queue = fakeQueue();
  const schedulers = [
    { id: 'salt', schedule: { pattern: '0 0 * * *' } as const },
    { id: 'delete', schedule: { pattern: '0 * * * *' } as const },
  ];
  const flags = { selfHosted: false, production: false };

  await startSchedulers({ queue, flags, logger: stubLogger(), schedulers });
  await startSchedulers({ queue, flags, logger: stubLogger(), schedulers });

  const finalKeys = (await queue.getJobSchedulers()).map((s) => s.key).sort();
  expect(finalKeys).toEqual(['delete', 'salt']);
  // Neither run finds a scheduler outside its declared set, so pruning never
  // fires — confirms a second replica's boot neither drops nor duplicates.
  expect(queue.calls.removedSchedulers).toEqual([]);
});
