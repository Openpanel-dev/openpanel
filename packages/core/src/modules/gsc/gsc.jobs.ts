// Ported from apps/worker/src/jobs/gsc.ts + boot-cron.ts's gscSync schedule
// (M5-002).
//
// `gscProjectSync` / `gscProjectBackfill` are this module's own queue (`gsc`
// in the registry — ADR-005's registry key). `gscSync` is a cron fragment:
// declared here, spread into the ONE `cron` queue by jobs.registry.ts and
// into `CRON_SCHEDULES` by jobs/schedulers.ts. Scheduler id and cadence are
// V1's, unchanged (apps/worker/src/boot-cron.ts).

import { z } from 'zod';
import { defineJob } from '../../jobs/define';
import type { SchedulerDefinition } from '../../jobs/schedulers';

const gscProjectPayload = z.object({ projectId: z.string() });

/** The `gsc` queue's own jobs. */
export const gscQueueJobs = {
  gscProjectSync: defineJob({
    payload: gscProjectPayload,
    handler: async ({ payload, ctx }) => {
      await ctx.services.gsc.runProjectSync(payload.projectId);
    },
  }),

  gscProjectBackfill: defineJob({
    payload: gscProjectPayload,
    handler: async ({ payload, ctx }) => {
      await ctx.services.gsc.runProjectBackfill(payload.projectId);
    },
  }),
};

/** This module's fragment of the `cron` queue's jobs. */
export const gscCronJobs = {
  // Fans out one `gscProjectSync` job per project with a connected GSC site.
  // Matches V1 (apps/worker/src/jobs/gsc.ts's gscSyncAllJob).
  gscSync: defineJob({
    payload: z.null(),
    handler: async ({ ctx }) => {
      const connections = await ctx.services.gsc.listConnectionsForSync();

      for (const { projectId } of connections) {
        await ctx.queues.gsc.gscProjectSync.add({ projectId });
      }
    },
  }),
};

/** This module's fragment of `CRON_SCHEDULES` — id and cadence unchanged. */
export const gscCronSchedules: readonly SchedulerDefinition[] = [
  { id: 'gscSync', schedule: { pattern: '0 3 * * *' } },
];
