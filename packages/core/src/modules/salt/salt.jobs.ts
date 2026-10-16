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
