// `gscProjectSync` / `gscProjectBackfill` are this module's own queue (`gsc` in
// the registry — ADR-005's registry key). `gscSync` is a cron fragment, spread
// into the ONE `cron` queue by jobs.registry.ts. Scheduler id and cadence are
// V1's, unchanged (apps/worker/src/boot-cron.ts).

import { z } from 'zod';
import { defineJob } from '../../jobs/define';

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
    cron: { pattern: '0 3 * * *' },
    handler: async ({ ctx }) => {
      const connections = await ctx.services.gsc.listConnectionsForSync();

      for (const { projectId } of connections) {
        await ctx.queues.gsc.gscProjectSync.add({ projectId });
      }
    },
  }),
};
