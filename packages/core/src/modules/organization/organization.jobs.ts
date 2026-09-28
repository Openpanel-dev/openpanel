// The schedules moved onto the jobs at ADR-021.
//
// `delete` is this module's fragment of the ONE `cron` queue's jobs, spread
// into jobs.registry.ts. Scheduler id and cadence are V1's, unchanged
// (apps/worker/src/boot-cron.ts).

import { z } from 'zod';
import type { Ctx } from '../../context';
import { defineJob } from '../../jobs/define';
import type { Logger } from '../../logger';
import {
  buildWinBackHighlight,
  type WinBackHighlightDeps,
} from './src/win-back-highlight';
import {
  runWindDownCron,
  type WindDownDb,
  type WindDownDeps,
} from './src/wind-down';

/** Hourly — V1's cadence (apps/worker/src/boot-cron.ts). */
const WIND_DOWN_CRON = '0 * * * *';

/** This module's fragment of the `cron` queue's jobs. */
export const organizationCronJobs = {
  delete: defineJob({
    payload: z.null(),
    cron: { pattern: '0 * * * *' },
    handler: async ({ ctx }) => {
      const result = await ctx.services.organization.runDeleteCron();
      ctx.logger.info({ ...result }, 'Delete cron complete');
    },
  }),
  windDown: defineJob({
    payload: z.null(),
    cron: { pattern: WIND_DOWN_CRON },
    handler: async ({ ctx }) => {
      await runWindDownCron(
        await windDownDeps(ctx, ctx.logger.child({ job: 'wind-down' }))
      );
    },
  }),
};

/**
 * The wind-down cron's dependencies, bound to the job's own ctx.
 *
 * Two reaches stay dynamic. The sibling service's two ClickHouse counts are not
 * on `OrganizationService`, and `src/win-back-pitch.ts` pulls the agent runtime
 * — a static edge from here would drag either into jobs.registry.ts's eager
 * import graph, which every core test file walks. M15-119 (R11) ruled this the
 * ADR-022 "legitimate lazy asset load" exception, not the sibling- service
 * defect R6 forbids: kept as is.
 */
async function windDownDeps(ctx: Ctx, logger: Logger): Promise<WindDownDeps> {
  const [
    { getOrganizationEventsCount, getOrganizationEventsCountSince },
    { generateWinBackPitch },
  ] = await Promise.all([
    import('./organization.service'),
    import('./src/win-back-pitch'),
  ]);

  const highlight: WinBackHighlightDeps = {
    logger,
    getAnalyticsOverview: (input) =>
      ctx.services.overview.getAnalyticsOverviewCore(input),
    getTopPages: (input) => ctx.services.pages.getTopPagesCore(input),
    generatePitch: (facts) => generateWinBackPitch(ctx.config, facts),
  };

  return {
    db: ctx.db as unknown as WindDownDb,
    logger,
    config: ctx.config,
    sendEmail: ctx.clients.email.sendEmail,
    getLastEventPerProject: () => ctx.services.project.getLastEventPerProject(),
    getOrganizationEventsCount: (projectIds) =>
      getOrganizationEventsCount(ctx, projectIds),
    getOrganizationEventsCountSince: (projectIds, since) =>
      getOrganizationEventsCountSince(ctx, projectIds, since),
    buildHighlight: (input) => buildWinBackHighlight(input, highlight),
  };
}
