// Ported from apps/worker/src/jobs/cron.delete.ts + boot-cron.ts's `delete`
// schedule (M6-001); `windDown` joined it at M9-003, the wave that deletes
// apps/worker (ADR-005's acceptance note gives it to this module).
//
// `delete` is this module's fragment of the ONE `cron` queue's jobs:
// declared here, spread into jobs.registry.ts and into `CRON_SCHEDULES` by
// jobs/schedulers.ts. Scheduler id and cadence are V1's, unchanged
// (apps/worker/src/boot-cron.ts).

import { z } from 'zod';
import { defineJob } from '../../jobs/define';
import type { SchedulerDefinition } from '../../jobs/schedulers';
import { loadWindDownDeps, runWindDownCron } from './src/wind-down';

/** Hourly — V1's cadence (apps/worker/src/boot-cron.ts). */
const WIND_DOWN_CRON = '0 * * * *';

/** This module's fragment of the `cron` queue's jobs. */
export const organizationCronJobs = {
  delete: defineJob({
    payload: z.null(),
    handler: async ({ ctx }) => {
      const result = await ctx.services.organization.runDeleteCron();
      ctx.logger.info({ ...result }, 'Delete cron complete');
    },
  }),
  windDown: defineJob({
    payload: z.null(),
    handler: async ({ ctx }) => {
      const logger = ctx.logger.child({ job: 'wind-down' });
      await runWindDownCron(await loadWindDownDeps(logger));
    },
  }),
};

/** This module's fragment of `CRON_SCHEDULES` — id and cadence unchanged. */
export const organizationCronSchedules: readonly SchedulerDefinition[] = [
  { id: 'delete', schedule: { pattern: '0 * * * *' } },
  { id: 'windDown', schedule: { pattern: WIND_DOWN_CRON } },
];
