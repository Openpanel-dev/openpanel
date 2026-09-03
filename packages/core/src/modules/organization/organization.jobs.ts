// Ported from apps/worker/src/jobs/cron.delete.ts + boot-cron.ts's `delete`
// schedule (M6-001).
//
// `delete` is this module's fragment of the ONE `cron` queue's jobs:
// declared here, spread into jobs.registry.ts and into `CRON_SCHEDULES` by
// jobs/schedulers.ts. Scheduler id and cadence are V1's, unchanged
// (apps/worker/src/boot-cron.ts).

import { z } from 'zod';
import { defineJob } from '../../jobs/define';
import type { SchedulerDefinition } from '../../jobs/schedulers';

/** This module's fragment of the `cron` queue's jobs. */
export const organizationCronJobs = {
  delete: defineJob({
    payload: z.null(),
    handler: async ({ ctx }) => {
      const result = await ctx.services.organization.runDeleteCron();
      ctx.logger.info({ ...result }, 'Delete cron complete');
    },
  }),
};

/** This module's fragment of `CRON_SCHEDULES` — id and cadence unchanged. */
export const organizationCronSchedules: readonly SchedulerDefinition[] = [
  { id: 'delete', schedule: { pattern: '0 * * * *' } },
];
