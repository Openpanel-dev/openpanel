// Ported from apps/worker/src/jobs/cron.ts's `flushProfiles` /
// `flushProfileBackfill` cases + boot-cron.ts's `flush` schedules (M8-004).
// Both buffers are this module's domain: the profile buffer
// (Redis → ClickHouse `profiles`) and the profile-backfill buffer, which
// patches a session's `profile_id` once a device is identified after the
// session row was already written.

import { z } from 'zod';
import { defineJob } from '../../jobs/define';
import type { SchedulerDefinition } from '../../jobs/schedulers';

const FLUSH_PROFILES_INTERVAL_MS = 10_000;
const FLUSH_PROFILE_BACKFILL_INTERVAL_MS = 30_000;

/** This module's fragment of the `cron` queue's jobs. */
export const profileCronJobs = {
  flushProfiles: defineJob({
    payload: z.null(),
    handler: async ({ ctx }) => {
      await ctx.buffers.profile.tryFlush({ trigger: 'cron' });
    },
  }),
  flushProfileBackfill: defineJob({
    payload: z.null(),
    handler: async ({ ctx }) => {
      await ctx.buffers.profileBackfill.tryFlush({ trigger: 'cron' });
    },
  }),
};

/** This module's fragment of `CRON_SCHEDULES` — ids and cadences unchanged. */
export const profileCronSchedules: readonly SchedulerDefinition[] = [
  { id: 'flushProfiles', schedule: { every: FLUSH_PROFILES_INTERVAL_MS } },
  {
    id: 'flushProfileBackfill',
    schedule: { every: FLUSH_PROFILE_BACKFILL_INTERVAL_MS },
  },
];
