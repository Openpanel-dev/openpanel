// The event buffer (Redis -> ClickHouse `events`) and the bot buffer
// (-> `events_bots`) are this module's domain.

import { z } from 'zod';
import { defineJob } from '../../jobs/define';

const FLUSH_EVENTS_INTERVAL_MS = 10_000;
const FLUSH_BOTS_INTERVAL_MS = 30_000;

/** This module's fragment of the `cron` queue's jobs. */
export const eventCronJobs = {
  flushEvents: defineJob({
    payload: z.null(),
    cron: { every: FLUSH_EVENTS_INTERVAL_MS },
    handler: async ({ ctx }) => {
      await ctx.buffers.event.tryFlush({ trigger: 'cron' });
    },
  }),
  flushBots: defineJob({
    payload: z.null(),
    cron: { every: FLUSH_BOTS_INTERVAL_MS },
    handler: async ({ ctx }) => {
      await ctx.buffers.bot.tryFlush({ trigger: 'cron' });
    },
  }),
};
