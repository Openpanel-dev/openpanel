//
// `salt` is this module's fragment of the ONE `cron` queue's jobs, spread into
// jobs.registry.ts. Its schedule is now derived straight from `cron` below — id
// and cadence are V1's, unchanged (apps/worker/src/boot-cron.ts).

import { z } from 'zod';
import { defineJob } from '../../jobs/define';

/** This module's fragment of the `cron` queue's jobs. */
export const saltCronJobs = {
  salt: defineJob({
    payload: z.null(),
    cron: { pattern: '0 0 * * *' },
    handler: async ({ ctx }) => {
      await ctx.services.salt.rotateSalt();
    },
  }),
};
