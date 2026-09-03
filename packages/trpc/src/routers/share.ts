// Dissolved into @openpanel/core's share module (M6-004): the query/mutation
// bodies moved to packages/core/src/modules/share/share.service.ts. This
// router stays (DELEGATE PATTERN) — it keeps V1's protectedProcedure stack
// (session/access/logger middleware) and delegates every handler body to
// core's share functions, same as reference's router does.

import {
  createShareDashboard,
  createShareOverview,
  createShareReport,
  getShareDashboard,
  getShareDashboardReports,
  getShareDashboardSettings,
  getShareOverview,
  getShareOverviewSettings,
  getShareReport,
  getShareReportSettings,
  zShareDashboard,
  zShareOverview,
  zShareReport,
} from '@openpanel/core';
import { z } from 'zod';
import { requireProjectAccess } from '../access';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';

export const shareRouter = createTRPCRouter({
  overview: publicProcedure
    .input(z.object({ shareId: z.string() }))
    .query(({ input, ctx }) => getShareOverview(input.shareId, ctx.cookies)),

  overviewSettings: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input }) => getShareOverviewSettings(input.projectId)),

  createOverview: protectedProcedure
    .input(zShareOverview)
    .mutation(({ input }) => createShareOverview(input)),

  // Dashboard sharing
  dashboard: publicProcedure
    .input(z.object({ shareId: z.string() }))
    .query(({ input, ctx }) => getShareDashboard(input.shareId, ctx.cookies)),

  dashboardSettings: protectedProcedure
    .input(z.object({ projectId: z.string(), dashboardId: z.string() }))
    .query(({ input }) =>
      getShareDashboardSettings(input.projectId, input.dashboardId)
    ),

  createDashboard: protectedProcedure
    .input(zShareDashboard)
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });
      return createShareDashboard(input);
    }),

  dashboardReports: publicProcedure
    .input(z.object({ shareId: z.string() }))
    .query(({ input, ctx }) =>
      getShareDashboardReports(input.shareId, ctx.cookies)
    ),

  // Report sharing
  report: publicProcedure
    .input(z.object({ shareId: z.string() }))
    .query(({ input, ctx }) => getShareReport(input.shareId, ctx.cookies)),

  reportSettings: protectedProcedure
    .input(z.object({ projectId: z.string(), reportId: z.string() }))
    .query(({ input }) =>
      getShareReportSettings(input.projectId, input.reportId)
    ),

  createReport: protectedProcedure
    .input(zShareReport)
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });
      return createShareReport(input);
    }),
});
