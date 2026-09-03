// Ported from apps/worker/src/jobs/cron.onboarding.ts + boot-cron.ts's
// `onboarding` schedule (M6-003).
//
// `onboarding` is this module's fragment of the ONE `cron` queue's jobs:
// declared here, spread into jobs.registry.ts and into `CRON_SCHEDULES` by
// jobs/schedulers.ts. Scheduler id and cadence are V1's, unchanged
// (apps/worker/src/boot-cron.ts) — same shape as organization.jobs.ts (M6-001).

import { z } from 'zod';
import { defineJob } from '../../jobs/define';
import type { SchedulerDefinition } from '../../jobs/schedulers';

/** This module's fragment of the `cron` queue's jobs. */
export const onboardingCronJobs = {
  onboarding: defineJob({
    payload: z.null(),
    handler: async ({ ctx }) => {
      const result = await ctx.services.onboarding.runOnboardingCron();
      if (result) {
        ctx.logger.info({ ...result }, 'Completed onboarding email job');
      }
    },
  }),
};

/** This module's fragment of `CRON_SCHEDULES` — id and cadence unchanged. */
export const onboardingCronSchedules: readonly SchedulerDefinition[] = [
  { id: 'onboarding', schedule: { pattern: '0 * * * *' } },
];
