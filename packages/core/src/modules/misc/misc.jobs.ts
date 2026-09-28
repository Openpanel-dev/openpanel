// `ping` is this module's fragment of the ONE `cron` queue's jobs: declared
// here and spread into jobs.registry.ts, same shape as organization.jobs.ts's
// `delete`. Its `cron` is explicitly `null` (ADR-021's on-demand state, not
// "always scheduled") — `PING_SCHEDULE` in jobs/schedulers.ts adds it
// separately, conditionally on `SELF_HOSTED && production`, because it is the
// one scheduler that isn't always-on.

import { z } from 'zod';
import { defineJob } from '../../jobs/define';
import { type DataHealthDb, runDataHealthCron } from './src/data-health';

/** Daily 07:30 UTC — V1's cadence (apps/worker/src/boot-cron.ts). */
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
