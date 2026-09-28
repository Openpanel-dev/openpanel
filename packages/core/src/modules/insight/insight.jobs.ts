// `insightsProject` is this module's own queue (`insights` in the registry —
// ADR-005's registry key). `insightsDaily` / `insightCleanup` / `weeklyDigest`
// are cron fragments, spread into the ONE `cron` queue by jobs.registry.ts.
// Scheduler ids and cadences are V1's, unchanged
// (apps/worker/src/boot-cron.ts).

import { z } from 'zod';
import { defineJob } from '../../jobs/define';

const insightsProjectPayload = z.object({
  projectId: z.string(),
  date: z.string(),
});

/** The `insights` queue's own jobs. */
export const insightQueueJobs = {
  insightsProject: defineJob({
    payload: insightsProjectPayload,
    handler: async ({ payload, ctx }) => {
      await ctx.services.insight.runProjectInsights(payload);
    },
  }),
};

/** This module's fragment of the `cron` queue's jobs. */
export const insightCronJobs = {
  // Fans out one `insightsProject` job per eligible project. Jobs are
  // deduplicated by a per-day, per-project jobId — matches V1
  // (apps/worker/src/jobs/insights.ts).
  insightsDaily: defineJob({
    payload: z.null(),
    cron: { pattern: '0 2 * * *' },
    handler: async ({ ctx }) => {
      const date = new Date().toISOString().slice(0, 10);
      const candidates =
        await ctx.services.insight.listDailyInsightCandidates(date);

      for (const candidate of candidates) {
        await ctx.queues.insights.insightsProject.add(candidate, {
          jobId: `daily:${candidate.date}:${candidate.projectId}`,
        });
      }
    },
  }),

  // Daily 04:30 UTC — prunes stale insights/events.
  insightCleanup: defineJob({
    payload: z.null(),
    cron: { pattern: '30 4 * * *' },
    handler: async ({ ctx }) => {
      await ctx.services.insight.cleanupStaleInsights();
    },
  }),

  // Mondays 08:00 UTC — weekly analytics digest email.
  weeklyDigest: defineJob({
    payload: z.null(),
    cron: { pattern: '0 8 * * 1' },
    handler: async ({ ctx }) => {
      await ctx.services.insight.sendWeeklyDigests();
    },
  }),
};
