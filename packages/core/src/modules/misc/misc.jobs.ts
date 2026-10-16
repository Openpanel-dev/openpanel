// `cron` is explicitly `null` (on-demand): `PING_SCHEDULE` in jobs/schedulers.ts adds
// it separately, only on `SELF_HOSTED && production`.

import { z } from 'zod';
import { defineJob } from '../../jobs/define';
import { type DataHealthDb, runDataHealthCron } from './src/data-health';

const DATA_HEALTH_CRON = '30 7 * * *';

/** This module's fragment of the `cron` queue's jobs. */
export const miscCronJobs = {
  ping: defineJob({
    payload: z.null(),
    cron: null,
    handler: async ({ ctx }) => {
      await ctx.services.misc.runPingCron();
    },
  }),
  dataHealth: defineJob({
    payload: z.null(),
    cron: { pattern: DATA_HEALTH_CRON },
    handler: async ({ ctx }) => {
      await runDataHealthCron({
        db: ctx.db as unknown as DataHealthDb,
        logger: ctx.logger.child({ job: 'data-health' }),
        config: ctx.config,
        getLastEventPerProject: () =>
          ctx.services.project.getLastEventPerProject(),
        sendEmail: (template, options) =>
          ctx.clients.email.sendEmail(
            template,
            options as { to: string; data: never }
          ),
      });
    },
  }),
};
