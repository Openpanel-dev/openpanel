// The event buffer (Redis -> ClickHouse `events`) is this module's domain.

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
