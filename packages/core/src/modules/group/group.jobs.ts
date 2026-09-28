// Ported from apps/worker/src/jobs/cron.ts's `flushGroups` case +
// boot-cron.ts's `flush`/`flushGroups` schedule; the schedule moved onto the
// job at ADR-021. The group buffer (Redis → ClickHouse `groups`) is this
// module's domain.

import { z } from 'zod';
import { defineJob } from '../../jobs/define';

const FLUSH_GROUPS_INTERVAL_MS = 10_000;

/** This module's fragment of the `cron` queue's jobs. */
export const groupCronJobs = {
  flushGroups: defineJob({
    payload: z.null(),
    cron: { every: FLUSH_GROUPS_INTERVAL_MS },
    handler: async ({ ctx }) => {
      await ctx.buffers.group.tryFlush({ trigger: 'cron' });
    },
  }),
};
