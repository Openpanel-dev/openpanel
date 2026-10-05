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
