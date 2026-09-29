// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE the
// input parser. The explicit checks in the handlers below stay: `enforceAccess`
// only sees a TOP-LEVEL `projectId` / `organizationId`, so anything resolved
// from another id needs its own.
//
// The handler bodies reach the module through `ctx.services.share`, so the
// requestId minted at the edge reaches the Postgres call.
//
// The permission ladder itself is bound once, in auth.service.ts; every
// procedure here reaches it through `ctx.services.auth`. `createOverview` has
// no in-handler check — a known gap, not fixed.

import { z } from 'zod';
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '../../rpc/base';
import {
  zShareDashboard,
  zShareOverview,
  zShareReport,
} from './share.constants';

export const shareRouter = createTRPCRouter({
  overview: publicProcedure
    .input(z.object({ shareId: z.string() }))
    .query(({ input, ctx }) =>
      ctx.services.share.getShareOverview(input.shareId, ctx.cookies)
    ),

  overviewSettings: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input, ctx }) => {
      return ctx.services.share.getShareOverviewSettings(input.projectId);
    }),

  createOverview: protectedProcedure
    .input(zShareOverview)
    .mutation(({ input, ctx }) => {
      return ctx.services.share.createShareOverview(input);
    }),

  dashboard: publicProcedure
    .input(z.object({ shareId: z.string() }))
    .query(({ input, ctx }) =>
      ctx.services.share.getShareDashboard(input.shareId, ctx.cookies)
    ),

  dashboardSettings: protectedProcedure
    .input(z.object({ projectId: z.string(), dashboardId: z.string() }))
    .query(({ input, ctx }) => {
      return ctx.services.share.getShareDashboardSettings(
        input.projectId,
        input.dashboardId
      );
    }),

  createDashboard: protectedProcedure
    .input(zShareDashboard)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'write',
      });
      return ctx.services.share.createShareDashboard(input);
    }),

  dashboardReports: publicProcedure
    .input(z.object({ shareId: z.string() }))
    .query(({ input, ctx }) =>
      ctx.services.share.getShareDashboardReports(input.shareId, ctx.cookies)
    ),

  report: publicProcedure
    .input(z.object({ shareId: z.string() }))
    .query(({ input, ctx }) =>
      ctx.services.share.getShareReport(input.shareId, ctx.cookies)
    ),

  reportSettings: protectedProcedure
    .input(z.object({ projectId: z.string(), reportId: z.string() }))
    .query(({ input, ctx }) => {
      return ctx.services.share.getShareReportSettings(
        input.projectId,
        input.reportId
      );
    }),

  createReport: protectedProcedure
    .input(zShareReport)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'write',
      });
      return ctx.services.share.createShareReport(input);
    }),
});
