// Ported from apps/worker/src/jobs/cron.salt.ts + boot-cron.ts's `salt`
// schedule (M8-004).
//
// `salt` is this module's fragment of the ONE `cron` queue's jobs: declared
// here, spread into jobs.registry.ts and into `CRON_SCHEDULES` by
// jobs/schedulers.ts. Scheduler id and cadence are V1's, unchanged
// (apps/worker/src/boot-cron.ts).

import { z } from 'zod';
import { defineJob } from '../../jobs/define';
import type { SchedulerDefinition } from '../../jobs/schedulers';

/** This module's fragment of the `cron` queue's jobs. */
export const saltCronJobs = {
  salt: defineJob({
    payload: z.null(),
    handler: async ({ ctx }) => {
      await ctx.services.salt.rotateSalt();
    },
  }),
};

/** This module's fragment of `CRON_SCHEDULES` — id and cadence unchanged. */
export const saltCronSchedules: readonly SchedulerDefinition[] = [
  { id: 'salt', schedule: { pattern: '0 0 * * *' } },
];
