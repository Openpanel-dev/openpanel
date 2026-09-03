// Ported from apps/worker/src/jobs/cohort.compute.ts + cron.cohort-refresh.ts
// (M5-003).
//
// `cohortCompute` is this module's own queue — registry key `cohortCompute`
// EXACTLY (ADR-005's acceptance note: no env rename, so
// COHORTCOMPUTE_CONCURRENCY keeps working). `cohortRefresh` is a cron
// fragment: declared here, spread into the ONE `cron` queue by
// jobs.registry.ts and into `CRON_SCHEDULES` by jobs/schedulers.ts. Scheduler
// id and cadence are V1's, unchanged (apps/worker/src/boot-cron.ts).

import { z } from 'zod';
import { defineJob } from '../../jobs/define';
import type { SchedulerDefinition } from '../../jobs/schedulers';

const cohortComputePayload = z.object({ cohortId: z.string() });

/** The `cohortCompute` queue's own job. */
export const cohortQueueJobs = {
  cohortCompute: defineJob({
    payload: cohortComputePayload,
    handler: async ({ payload, ctx }) => {
      await ctx.services.cohort.updateMembership(payload.cohortId);
    },
  }),
};

/** This module's fragment of the `cron` queue's jobs. */
export const cohortCronJobs = {
  // Fans out one `cohortCompute` enqueue per non-static cohort. Matches V1
  // (apps/worker/src/jobs/cron.cohort-refresh.ts).
  cohortRefresh: defineJob({
    payload: z.null(),
    handler: async ({ ctx }) => {
      const cohortIds = await ctx.services.cohort.listRefreshableCohortIds();

      for (const cohortId of cohortIds) {
        await ctx.services.cohort.enqueueCompute(cohortId);
      }
    },
  }),
};

/** This module's fragment of `CRON_SCHEDULES` — id and cadence unchanged. */
export const cohortCronSchedules: readonly SchedulerDefinition[] = [
  { id: 'cohortRefresh', schedule: { pattern: '*/30 * * * *' } },
];
