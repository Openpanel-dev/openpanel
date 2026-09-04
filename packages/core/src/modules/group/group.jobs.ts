// Ported from apps/worker/src/jobs/cron.ts's `flushGroups` case +
// boot-cron.ts's `flush`/`flushGroups` schedule (M8-004). The group buffer
// (Redis → ClickHouse `groups`) is this module's domain.

import { z } from 'zod';
import { defineJob } from '../../jobs/define';
import type { SchedulerDefinition } from '../../jobs/schedulers';

const FLUSH_GROUPS_INTERVAL_MS = 10_000;

/** This module's fragment of the `cron` queue's jobs. */
export const groupCronJobs = {
  flushGroups: defineJob({
    payload: z.null(),
    handler: async ({ ctx }) => {
      await ctx.buffers.group.tryFlush({ trigger: 'cron' });
    },
  }),
};

/** This module's fragment of `CRON_SCHEDULES` — id and cadence unchanged. */
export const groupCronSchedules: readonly SchedulerDefinition[] = [
  { id: 'flushGroups', schedule: { every: FLUSH_GROUPS_INTERVAL_MS } },
];
