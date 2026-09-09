// Ports apps/worker/src/boot-cron.ts onto BullMQ's job-scheduler API
// (ADR-005). Upsert is keyed on job name — the V1 scheduler id — which is
// what makes it idempotent across replicas: two processes upserting the same
// id with the same repeat options at boot converge on one scheduler, with no
// locking of our own needed.
//
// ADR-021: the scheduler list is no longer a second, hand-maintained registry
// — it is derived from the `cron` queue's own jobs, so a job and its schedule
// cannot drift apart. `schedulersFromRegistry` takes the registry's `cron`
// queue as data; the registry itself calls it and exports the result as
// `CRON_SCHEDULES`, so this file imports nothing above it (ADR-022 R22).

import type { Logger } from '../logger';
import type { AnyJob, QueueDefinition, RepeatSchedule } from './define';
import { wrap } from './envelope';

export type { RepeatSchedule } from './define';

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
  // Mutable, not `readonly`: BullMQ's own `getJobs` declares `JobType[]`, and
  // a readonly parameter here would make the real `Queue` unassignable.
  getJobs(
    types: ('delayed' | 'waiting' | 'completed' | 'failed')[]
  ): Promise<{ id?: string | null; remove(): Promise<unknown> }[]>;
}

const CONFLICT_JOB_STATES = [
  'delayed',
  'waiting',
  'completed',
  'failed',
] as const;

const CONFLICT_ERROR_SUBSTRING = 'job ID already exists';

/**
 * Derives the scheduler list from the `cron` queue's own jobs (ADR-021) — the
 * join is by construction now, not by a second registry kept in sync by a
 * test. A job's `cron` is `RepeatSchedule` (always-on), `null` (on-demand —
 * e.g. `ping`, scheduled conditionally elsewhere), or, on the `cron` queue,
 * never simply absent: `defineQueue`'s overload for that queue name makes
 * omitting it a type error. This throw is the defensive fallback for the one
 * hole the type system can't close — a value forced through with `as any`.
 */
export function schedulersFromRegistry(
  cronQueue: QueueDefinition<Record<string, AnyJob>>
): SchedulerDefinition[] {
  const schedulers: SchedulerDefinition[] = [];

  for (const [jobName, job] of Object.entries(cronQueue.jobs)) {
    if (!('cron' in job)) {
      throw new Error(
        `cron queue job "${jobName}" has no "cron" field — declare a schedule or "cron: null" for on-demand (ADR-021)`
      );
    }
    if (job.cron) {
      schedulers.push({ id: jobName, schedule: job.cron });
    }
  }

  return schedulers.sort((a, b) => a.id.localeCompare(b.id));
}

// V1 gated this on `SELF_HOSTED && NODE_ENV === 'production'`
// (apps/worker/src/boot-cron.ts:133). `misc.jobs.ts`'s `ping` job declares
// `cron: null` for exactly this reason — it is never in `CRON_SCHEDULES`.
export const PING_SCHEDULE: SchedulerDefinition = {
  id: 'ping',
  schedule: { pattern: '0 0 * * *' },
};

export interface StartSchedulersOptions {
  queue: SchedulerQueue;
  flags: SchedulerFlags;
  logger: Logger;
  /** The derived cron set — `jobs.registry.ts`'s `CRON_SCHEDULES` in the app,
   *  a small fixture in a test. */
  schedulers: readonly SchedulerDefinition[];
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
  schedulers,
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
