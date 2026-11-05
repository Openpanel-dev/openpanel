// The ai_events buffer (Redis → ClickHouse `ai_events`) is this module's domain.

import { z } from 'zod';
import { defineJob } from '../../jobs/define';

const FLUSH_AI_EVENTS_INTERVAL_MS = 10_000;

/** This module's fragment of the `cron` queue's jobs. */
export const aiCronJobs = {
  flushAiEvents: defineJob({
    payload: z.null(),
    cron: { every: FLUSH_AI_EVENTS_INTERVAL_MS },
    handler: async ({ ctx }) => {
      await ctx.buffers.aiEvent.tryFlush({ trigger: 'cron' });
    },
  }),
};
