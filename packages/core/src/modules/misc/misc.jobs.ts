// Ported from apps/worker/src/jobs/cron.ping.ts + boot-cron.ts's `ping`
// schedule (M7-008).
//
// `ping` is this module's fragment of the ONE `cron` queue's jobs: declared
// here and spread into jobs.registry.ts, same shape as
// organization.jobs.ts's `delete` (M6-001). Its schedule is NOT spread into
// `CRON_SCHEDULES` here — `PING_SCHEDULE` in jobs/schedulers.ts already
// declares it, conditionally on `SELF_HOSTED && production`, because it is
// the one scheduler that isn't always-on.

import { z } from 'zod';
import { defineJob } from '../../jobs/define';

/** This module's fragment of the `cron` queue's jobs. */
export const miscCronJobs = {
  ping: defineJob({
    payload: z.null(),
    handler: async ({ ctx }) => {
      await ctx.services.misc.runPingCron();
    },
  }),
};
