// Ported from apps/worker/src/jobs/insights.ts, insights-enrich.ts,
// cron.insight-cleanup.ts and cron.weekly-digest.ts (M5-001).
//
// `insightsProject` is this module's own queue (`insights` in the registry —
// ADR-005's registry key). `insightsDaily` / `insightCleanup` / `weeklyDigest`
// are cron fragments: declared here, spread into the ONE `cron` queue by
// jobs.registry.ts and into `CRON_SCHEDULES` by jobs/schedulers.ts. Scheduler
// ids and cadences are V1's, unchanged (apps/worker/src/boot-cron.ts).

import { z } from 'zod';
import { defineJob } from '../../jobs/define';
import type { SchedulerDefinition } from '../../jobs/schedulers';

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

  insightCleanup: defineJob({
    payload: z.null(),
    handler: async ({ ctx }) => {
      await ctx.services.insight.cleanupStaleInsights();
    },
  }),

  weeklyDigest: defineJob({
    payload: z.null(),
    handler: async ({ ctx }) => {
      await ctx.services.insight.sendWeeklyDigests();
    },
  }),
};

/** This module's fragment of `CRON_SCHEDULES` — ids and cadences unchanged. */
export const insightCronSchedules: readonly SchedulerDefinition[] = [
  { id: 'insightsDaily', schedule: { pattern: '0 2 * * *' } },
  // Daily 04:30 UTC — prunes stale insights/events.
  { id: 'insightCleanup', schedule: { pattern: '30 4 * * *' } },
  // Mondays 08:00 UTC — weekly analytics digest email.
  { id: 'weeklyDigest', schedule: { pattern: '0 8 * * 1' } },
];
