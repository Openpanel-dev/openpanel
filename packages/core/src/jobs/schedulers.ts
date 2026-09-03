// Ports apps/worker/src/boot-cron.ts onto BullMQ's job-scheduler API
// (ADR-005). Upsert is keyed on job name — the V1 scheduler id — which is
// what makes it idempotent across replicas: two processes upserting the same
// id with the same repeat options at boot converge on one scheduler, with no
// locking of our own needed.

import type { Logger } from '../logger';
import { cohortCronSchedules } from '../modules/cohort/cohort.jobs';
import { gscCronSchedules } from '../modules/gsc/gsc.jobs';
import { insightCronSchedules } from '../modules/insight/insight.jobs';
import { organizationCronSchedules } from '../modules/organization/organization.jobs';
import { wrap } from './envelope';

export type RepeatSchedule = { pattern: string } | { every: number };

export interface SchedulerDefinition {
  /** V1 scheduler id: the job-scheduler key, and — via BullMQ's own default
   *  (`jobName ?? jobSchedulerId`) — the job name each run dispatches on. */
  id: string;
  schedule: RepeatSchedule;
}

export interface SchedulerFlags {
  selfHosted: boolean;
  production: boolean;
}

/**
 * The slice of BullMQ's `Queue` this needs, narrowed so a test can fake it
 * with no Redis connection — mirrors `RunnableJob` in `workers.ts`.
 */
export interface SchedulerQueue {
  getJobSchedulers(): Promise<{ key: string }[]>;
  upsertJobScheduler(
    id: string,
    repeatOpts: RepeatSchedule,
    jobTemplate?: { data?: unknown }
  ): Promise<unknown>;
  removeJobScheduler(id: string): Promise<boolean>;
  getJobs(
    types: readonly ('delayed' | 'waiting' | 'completed' | 'failed')[]
  ): Promise<{ id?: string | null; remove(): Promise<void> }[]>;
}

const CONFLICT_JOB_STATES = [
  'delayed',
  'waiting',
  'completed',
  'failed',
] as const;

const CONFLICT_ERROR_SUBSTRING = 'job ID already exists';

const MINUTE_MS = 60_000;

// V1's exact 19 always-on scheduler ids and cadences
// (apps/worker/src/boot-cron.ts). `ping` is the 20th and is conditional —
// see `PING_SCHEDULE` and `startSchedulers`.
export const CRON_SCHEDULES: readonly SchedulerDefinition[] = [
  { id: 'salt', schedule: { pattern: '0 0 * * *' } },
  // delete — owned by the organization module, declared next to its jobs
  // (modules/organization/organization.jobs.ts).
  ...organizationCronSchedules,
  { id: 'flushEvents', schedule: { every: 10_000 } },
  { id: 'flushProfiles', schedule: { every: 10_000 } },
  { id: 'flushSessions', schedule: { every: 10_000 } },
  { id: 'flushProfileBackfill', schedule: { every: 30_000 } },
  { id: 'flushReplay', schedule: { every: 10_000 } },
  { id: 'flushGroups', schedule: { every: 10_000 } },
  { id: 'onboarding', schedule: { pattern: '0 * * * *' } },
  // gscSync — owned by the gsc module, declared next to its jobs
  // (modules/gsc/gsc.jobs.ts).
  ...gscCronSchedules,
  // cohortRefresh — owned by the cohort module, declared next to its jobs
  // (modules/cohort/cohort.jobs.ts).
  ...cohortCronSchedules,
  { id: 'sessionReaper', schedule: { every: 5 * MINUTE_MS } },
  // Daily 04:00 UTC — backstop for cleanup leaks.
  { id: 'sessionVacuum', schedule: { pattern: '0 4 * * *' } },
  // insightsDaily / insightCleanup / weeklyDigest — owned by the insight
  // module, declared next to its jobs (modules/insight/insight.jobs.ts).
  ...insightCronSchedules,
  // Daily 07:30 UTC — no-data / data-stopped rescue emails. Owner: misc
  // (ADR-005 acceptance note completes the ownership map).
  { id: 'dataHealth', schedule: { pattern: '30 7 * * *' } },
  // Hourly — expired-trial wind-down emails, block, delete. Owner: organization.
  { id: 'windDown', schedule: { pattern: '0 * * * *' } },
  // Every 1 minute — drains export buffers to S3/GCS. Owner: integration.
  { id: 'flushExports', schedule: { every: MINUTE_MS } },
];

// V1 gated this on `SELF_HOSTED && NODE_ENV === 'production'`
// (apps/worker/src/boot-cron.ts:133).
export const PING_SCHEDULE: SchedulerDefinition = {
  id: 'ping',
  schedule: { pattern: '0 0 * * *' },
};

export interface StartSchedulersOptions {
  queue: SchedulerQueue;
  flags: SchedulerFlags;
  logger: Logger;
  /** Defaults to the V1 cron set; overridable so a test can use a small fixture. */
  schedulers?: readonly SchedulerDefinition[];
}

/**
 * Upserts every declared scheduler, keyed on job name, and prunes any
 * scheduler in Redis that is no longer declared — so an owner removed from
 * `schedulers` stops running rather than lingering forever.
 *
 * Safe to call from every replica at boot: `upsertJobScheduler` is BullMQ's
 * own idempotent operation, and pruning only ever removes schedulers this
 * call does not want, never ones another replica is mid-upserting.
 */
export async function startSchedulers({
  queue,
  flags,
  logger,
  schedulers = CRON_SCHEDULES,
}: StartSchedulersOptions): Promise<void> {
  const desired =
    flags.selfHosted && flags.production
      ? [...schedulers, PING_SCHEDULE]
      : schedulers;

  logger.info('updating cron jobs');

  await pruneStaleSchedulers(queue, new Set(desired.map((s) => s.id)), logger);

  for (const scheduler of desired) {
    await upsertWithConflictRetry(queue, scheduler, logger);
  }
}

async function pruneStaleSchedulers(
  queue: SchedulerQueue,
  desiredIds: Set<string>,
  logger: Logger
): Promise<void> {
  const current = await queue.getJobSchedulers().catch((error) => {
    logger.error({ err: error }, 'error getting job schedulers');
    return [];
  });

  for (const scheduler of current) {
    if (desiredIds.has(scheduler.key)) {
      continue;
    }
    await queue.removeJobScheduler(scheduler.key).catch((error) => {
      logger.error(
        { err: error, jobScheduler: scheduler.key },
        'error removing job scheduler'
      );
    });
  }
}

async function upsertWithConflictRetry(
  queue: SchedulerQueue,
  scheduler: SchedulerDefinition,
  logger: Logger
): Promise<void> {
  try {
    await upsert(queue, scheduler);
  } catch (error) {
    if (!isConflictError(error)) {
      logger.error(
        { err: error, job: scheduler.id },
        'error upserting job scheduler'
      );
      return;
    }

    logger.warn(
      { job: scheduler.id },
      'job scheduler conflict detected, attempting cleanup'
    );
    await removeConflictingJobs(queue, scheduler.id, logger);
    // Also try removing the scheduler itself to start fresh.
    await queue.removeJobScheduler(scheduler.id).catch(() => undefined);

    try {
      await upsert(queue, scheduler);
      logger.info({ job: scheduler.id }, 'job scheduler created after cleanup');
    } catch (retryError) {
      logger.error(
        { err: retryError, job: scheduler.id },
        'error upserting job scheduler after cleanup'
      );
    }
  }
}

function upsert(
  queue: SchedulerQueue,
  scheduler: SchedulerDefinition
): Promise<unknown> {
  // Envelope-shaped for every scheduler-created job — these are freshly
  // enqueued, never a replay of a V1-shaped job, so there is nothing for the
  // `cron` compat hook to do here (ADR-005: new data only, old shape read
  // back through `resolveJob`).
  return queue.upsertJobScheduler(scheduler.id, scheduler.schedule, {
    data: wrap(null, {}),
  });
}

function isConflictError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes(CONFLICT_ERROR_SUBSTRING)
  );
}

/** BullMQ scheduler-created job ids look like `repeat:<key>:<timestamp>`. */
async function removeConflictingJobs(
  queue: SchedulerQueue,
  schedulerKey: string,
  logger: Logger
): Promise<void> {
  for (const state of CONFLICT_JOB_STATES) {
    try {
      const jobs = await queue.getJobs([state]);
      for (const job of jobs) {
        if (job.id?.startsWith(`repeat:${schedulerKey}:`)) {
          await job.remove();
          logger.info(
            { jobId: job.id, schedulerKey },
            'removed conflicting scheduler job'
          );
        }
      }
    } catch {
      // Ignored during cleanup — V1's behaviour (boot-cron.ts:24-26).
    }
  }
}
