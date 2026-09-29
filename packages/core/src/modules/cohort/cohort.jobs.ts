// `cohortCompute` is this module's own queue — registry key `cohortCompute`
// EXACTLY (no env rename, so COHORTCOMPUTE_CONCURRENCY keeps working).
// `cohortRefresh` is a cron fragment, spread into the ONE `cron` queue by
// jobs.registry.ts.

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
  // Fans out one `cohortCompute` enqueue per non-static cohort.
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
