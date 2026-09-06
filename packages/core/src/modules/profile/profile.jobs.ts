// Ported from apps/worker/src/jobs/cron.ts's `flushProfiles` /
// `flushProfileBackfill` cases + boot-cron.ts's `flush` schedules (M8-004);
// the schedules moved onto the jobs at ADR-021 (M10-007). Both buffers are
// this module's domain: the profile buffer (Redis → ClickHouse `profiles`)
// and the profile-backfill buffer, which patches a session's `profile_id`
// once a device is identified after the session row was already written.

import { z } from 'zod';
import { defineJob } from '../../jobs/define';

const FLUSH_PROFILES_INTERVAL_MS = 10_000;
const FLUSH_PROFILE_BACKFILL_INTERVAL_MS = 30_000;

/** This module's fragment of the `cron` queue's jobs. */
export const profileCronJobs = {
  flushProfiles: defineJob({
    payload: z.null(),
    cron: { every: FLUSH_PROFILES_INTERVAL_MS },
    handler: async ({ ctx }) => {
      await ctx.buffers.profile.tryFlush({ trigger: 'cron' });
    },
  }),
  flushProfileBackfill: defineJob({
    payload: z.null(),
    cron: { every: FLUSH_PROFILE_BACKFILL_INTERVAL_MS },
    handler: async ({ ctx }) => {
      await ctx.buffers.profileBackfill.tryFlush({ trigger: 'cron' });
    },
  }),
};
