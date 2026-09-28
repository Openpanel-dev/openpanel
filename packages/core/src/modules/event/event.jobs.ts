// The event buffer (Redis → ClickHouse `events`) is this module's domain, so
// its flush cron fragment lives here rather than on the ingest module that
// merely writes to it.

import { z } from 'zod';
import { defineJob } from '../../jobs/define';

const FLUSH_EVENTS_INTERVAL_MS = 10_000;

/** This module's fragment of the `cron` queue's jobs. */
export const eventCronJobs = {
  flushEvents: defineJob({
    payload: z.null(),
    cron: { every: FLUSH_EVENTS_INTERVAL_MS },
    handler: async ({ ctx }) => {
      await ctx.buffers.event.tryFlush({ trigger: 'cron' });
    },
  }),
};
