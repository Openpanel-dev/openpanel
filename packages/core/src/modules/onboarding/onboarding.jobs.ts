//
// `onboarding` is this module's fragment of the ONE `cron` queue's jobs, spread
// into jobs.registry.ts. Scheduler id and cadence are V1's, unchanged
// (apps/worker/src/boot-cron.ts) — same shape as organization.jobs.ts.

import { z } from 'zod';
import { defineJob } from '../../jobs/define';

/** This module's fragment of the `cron` queue's jobs. */
export const onboardingCronJobs = {
  onboarding: defineJob({
    payload: z.null(),
    cron: { pattern: '0 * * * *' },
    handler: async ({ ctx }) => {
      const result = await ctx.services.onboarding.runOnboardingCron();
      if (result) {
        ctx.logger.info({ ...result }, 'Completed onboarding email job');
      }
    },
  }),
};
