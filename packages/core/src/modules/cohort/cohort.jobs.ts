// Ported from apps/worker/src/jobs/cohort.compute.ts + cron.cohort-refresh.ts
// (M5-003); the schedule moved onto the job at ADR-021 (M10-007).
//
// `cohortCompute` is this module's own queue — registry key `cohortCompute`
// EXACTLY (ADR-005's acceptance note: no env rename, so
// COHORTCOMPUTE_CONCURRENCY keeps working). `cohortRefresh` is a cron
// fragment, spread into the ONE `cron` queue by jobs.registry.ts. Scheduler
// id and cadence are V1's, unchanged (apps/worker/src/boot-cron.ts).

import { z } from 'zod';
import { defineJob } from '../../jobs/define';

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
    cron: { pattern: '*/30 * * * *' },
    handler: async ({ ctx }) => {
      const cohortIds = await ctx.services.cohort.listRefreshableCohortIds();

      for (const cohortId of cohortIds) {
        await ctx.services.cohort.enqueueCompute(cohortId);
      }
    },
  }),
};
