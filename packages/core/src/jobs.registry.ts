// The seven BullMQ queues, statically composed. Adding a module's jobs is one
// spread into the queue that owns them; there is no auto-discovery, because
// static composition is what keeps `QueueProducers` typed (ADR-007).
//
// Registry key === Redis name for all seven, `cohortCompute` included: ADR-005's
// acceptance note refuses the rename, so `COHORTCOMPUTE_CONCURRENCY` keeps
// working. `queueKey` decides what actually reaches Redis.
//
// Retry and retention values are V1's, verbatim, defects included — five
// queues that never retry, four whose failed sets are unbounded. Changing them
// is a behaviour change and a separate decision (ADR-005 acceptance note).

import { legacyCompat } from './jobs/compat';
import type { Producers } from './jobs/define';
import { defineQueue } from './jobs/define';
import type { ProducerHandle } from './jobs/producers';
import { cohortCronJobs, cohortQueueJobs } from './modules/cohort/cohort.jobs';
import { gscCronJobs, gscQueueJobs } from './modules/gsc/gsc.jobs';
import {
  insightCronJobs,
  insightQueueJobs,
} from './modules/insight/insight.jobs';

const HOUR_IN_SECONDS = 3600;
const DAY_IN_SECONDS = 86_400;
const COHORT_BACKOFF_MS = 5000;
const COHORT_ATTEMPTS = 3;

// Defaults from apps/worker/src/boot-workers.ts; `<KEY>_CONCURRENCY`
// overrides one at boot.
const CONCURRENCY = {
  sessions: 1,
  cron: 1,
  notification: 1,
  import: 1,
  insights: 5,
  gsc: 5,
  cohortCompute: 2,
} as const;

const sessions = defineQueue('sessions', {
  defaults: { removeOnComplete: true },
  worker: { concurrency: CONCURRENCY.sessions },
  compat: legacyCompat.sessions,
  jobs: {},
});

// One queue, one worker at concurrency 1, every scheduled job in the system.
// Pausing it from bull-board halts all buffer flushing — preserved
// deliberately (docs/ANSWERS.md §3: "known!").
const cron = defineQueue('cron', {
  defaults: { removeOnComplete: 10 },
  worker: { concurrency: CONCURRENCY.cron },
  compat: legacyCompat.cron,
  // Every module's cron fragment spreads in here (ADR-005: "no cron module").
  jobs: {
    ...insightCronJobs,
    ...gscCronJobs,
    ...cohortCronJobs,
  },
});

const notification = defineQueue('notification', {
  defaults: { removeOnComplete: 10 },
  worker: { concurrency: CONCURRENCY.notification },
  compat: legacyCompat.notification,
  jobs: {},
});

const importQueue = defineQueue('import', {
  defaults: { removeOnComplete: 10, removeOnFail: 50 },
  worker: { concurrency: CONCURRENCY.import },
  compat: legacyCompat.import,
  jobs: {},
});

const insights = defineQueue('insights', {
  defaults: { removeOnComplete: 100 },
  worker: { concurrency: CONCURRENCY.insights },
  compat: legacyCompat.insights,
  jobs: {
    ...insightQueueJobs,
  },
});

const gsc = defineQueue('gsc', {
  defaults: { removeOnComplete: 50, removeOnFail: 100 },
  worker: { concurrency: CONCURRENCY.gsc },
  compat: legacyCompat.gsc,
  jobs: {
    ...gscQueueJobs,
  },
});

const cohortCompute = defineQueue('cohortCompute', {
  defaults: {
    attempts: COHORT_ATTEMPTS,
    backoff: { type: 'exponential', delay: COHORT_BACKOFF_MS },
    // `age` alone only trims when another job in this queue finishes, so it is
    // paired with a count bound.
    removeOnComplete: { age: HOUR_IN_SECONDS, count: 100 },
    removeOnFail: { age: DAY_IN_SECONDS, count: 100 },
  },
  worker: { concurrency: CONCURRENCY.cohortCompute },
  compat: legacyCompat.cohortCompute,
  jobs: {
    ...cohortQueueJobs,
  },
});

export const queues = {
  sessions,
  cron,
  notification,
  import: importQueue,
  insights,
  gsc,
  cohortCompute,
};

export type Queues = typeof queues;

/** What `ctx.queues` is: `ctx.queues.import.run.add({ importId })`. */
export type QueueProducers = Producers<Queues>;

/** What `AppDeps.producers` is — built once at boot, scoped per unit of work. */
export type QueueProducerHandle = ProducerHandle<Queues>;
