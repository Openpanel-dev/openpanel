// Ported from apps/worker/src/jobs/cron.ts's `flushEvents` case +
// boot-cron.ts's `flush`/`flushEvents` schedule (M8-004). The event buffer
// (Redis → ClickHouse `events`) is this module's domain, so its flush cron
// fragment lives here rather than on the ingest module that merely writes to it.

import { z } from 'zod';
import { defineJob } from '../../jobs/define';
import type { SchedulerDefinition } from '../../jobs/schedulers';

const FLUSH_EVENTS_INTERVAL_MS = 10_000;

/** This module's fragment of the `cron` queue's jobs. */
export const eventCronJobs = {
  flushEvents: defineJob({
    payload: z.null(),
    handler: async ({ ctx }) => {
      await ctx.buffers.event.tryFlush({ trigger: 'cron' });
    },
  }),
};

/** This module's fragment of `CRON_SCHEDULES` — id and cadence unchanged. */
export const eventCronSchedules: readonly SchedulerDefinition[] = [
  { id: 'flushEvents', schedule: { every: FLUSH_EVENTS_INTERVAL_MS } },
];
