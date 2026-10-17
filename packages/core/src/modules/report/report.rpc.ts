// `protectedProcedure` runs `enforceAccess` BEFORE the input parser, and it only
// sees a TOP-LEVEL `projectId` / `organizationId`. Most inputs here carry a
// reportId or dashboardId instead, so the in-handler `requireProjectAccess`
// through `ctx.services.auth` is the only check that fires.

import { z } from 'zod';
import {
  createTRPCRouter,
  protectedProcedure,
  type TrpcContext,
} from '../../rpc/base';
import { TRPCNotFoundError } from '../../rpc/errors';
import { GRID_COLUMNS, GRID_MAX_ROWS, zReport } from './report.constants';

// Grid coordinates, so whole numbers inside the grid. A zero width or a
// height in the tens of thousands is a client bug, not a layout.
const zGridSpan = z.number().int().min(1).max(GRID_COLUMNS);
const zReportLayout = z.object({
  x: z.number().int().min(0).max(GRID_COLUMNS),
  y: z.number().int().min(0).max(GRID_MAX_ROWS),
  w: zGridSpan,
  h: z.number().int().min(1).max(GRID_MAX_ROWS),
  minW: zGridSpan.optional(),
  minH: z.number().int().min(1).max(GRID_MAX_ROWS).optional(),
  maxW: zGridSpan.optional(),
  maxH: z.number().int().min(1).max(GRID_MAX_ROWS).optional(),
});

// Project access only proves the caller owns `projectId`. Binding the
// caller-supplied `dashboardId` to that project as well is what stops a
// dashboard from another organization being rewritten through these handlers.
async function requireDashboardWrite(
  ctx: Pick<TrpcContext, 'services'> & { session: { userId: string } },
  { dashboardId, projectId }: { dashboardId: string; projectId: string }
) {
  await ctx.services.auth.requireProjectAccess({
    userId: ctx.session.userId,
    projectId,
    level: 'write',
  });
  const dashboard = await ctx.services.dashboard.getDashboardById(
    dashboardId,
    projectId
  );
  if (!dashboard) {
    throw new TRPCNotFoundError('Dashboard not found');
  }
}

export const reportRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        dashboardId: z.string(),
        projectId: z.string(),
      })
    )
    .query(async ({ input: { dashboardId, projectId }, ctx }) => {
      const dashboard = await ctx.services.dashboard.getDashboardById(
        dashboardId,
        projectId
      );
      if (!dashboard) {
        throw new TRPCNotFoundError('Dashboard not found');
      }
      return ctx.services.report.getReportsByDashboardId(dashboardId);
    }),

  create: protectedProcedure
    .input(
      z.object({
        report: zReport.omit({ projectId: true }),
        dashboardId: z.string(),
      })
    )
    .mutation(async ({ input: { report, dashboardId }, ctx }) => {
      const dbDashboard =
        await ctx.services.dashboard.getDashboardByIdOrThrow(dashboardId);
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: dbDashboard.projectId,
        level: 'write',
      });
      return ctx.services.report.createReport({
        dashboardId,
        projectId: dbDashboard.projectId,
        report,
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        reportId: z.string(),
        report: zReport.omit({ projectId: true }),
      })
    )
    .mutation(async ({ input: { report, reportId }, ctx }) => {
      const dbReport = await ctx.services.report.getReportByIdOrThrow(reportId);
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: dbReport.projectId,
        level: 'write',
      });
      return ctx.services.report.updateReport({ reportId, report });
    }),

  move: protectedProcedure
    .input(
      z.object({
        reportId: z.string(),
        dashboardId: z.string(),
      })
    )
    .mutation(async ({ input: { reportId, dashboardId }, ctx }) => {
      const dbReport = await ctx.services.report.getReportByIdOrThrow(reportId);
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: dbReport.projectId,
        level: 'write',
      });
      return ctx.services.report.moveReport({ report: dbReport, dashboardId });
    }),

  delete: protectedProcedure
    .input(
      z.object({
        reportId: z.string(),
      })
    )
    .mutation(async ({ input: { reportId }, ctx }) => {
      const dbReport = await ctx.services.report.getReportByIdOrThrow(reportId);
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: dbReport.projectId,
        level: 'write',
      });
      return ctx.services.report.deleteReport(reportId);
    }),

  duplicate: protectedProcedure
    .input(
      z.object({
        reportId: z.string(),
      })
    )
    .mutation(async ({ input: { reportId }, ctx }) => {
      const dbReport = await ctx.services.report.getReportByIdOrThrow(reportId);
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: dbReport.projectId,
        level: 'write',
      });
      return ctx.services.report.duplicateReport(dbReport);
    }),

  get: protectedProcedure
    .input(
      z.object({
        reportId: z.string(),
      })
    )
    .query(async ({ input: { reportId }, ctx }) => {
      const report = await ctx.services.report.getReportById(reportId);
      if (!report) {
        throw new TRPCNotFoundError('Report not found');
      }
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: report.projectId,
        level: 'read',
      });
      return report;
    }),

  updateLayouts: protectedProcedure
    .input(
      z.object({
        dashboardId: z.string(),
        projectId: z.string(),
        items: z
          .array(z.object({ reportId: z.string(), layout: zReportLayout }))
          .min(1),
      })
    )
    .mutation(async ({ input: { dashboardId, projectId, items }, ctx }) => {
      await requireDashboardWrite(ctx, { dashboardId, projectId });
      return ctx.services.report.updateReportLayouts({ dashboardId, items });
    }),

  resetLayout: protectedProcedure
    .input(
      z.object({
        dashboardId: z.string(),
        projectId: z.string(),
      })
    )
    .mutation(async ({ input: { dashboardId, projectId }, ctx }) => {
      await requireDashboardWrite(ctx, { dashboardId, projectId });
      return ctx.services.report.resetReportLayouts({
        dashboardId,
        projectId,
      });
    }),
});
