// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE the
// input parser. The explicit checks in the handlers below stay: `enforceAccess`
// only sees a TOP-LEVEL `projectId` / `organizationId`, so anything resolved
// from another id needs its own.
//
// Most of this router's inputs carry a reportId or a dashboardId rather than a
// projectId, so `enforceAccess` is blind to them and the in-handler
// `requireProjectAccess` through `ctx.services.auth` is the only check that
// fires.

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { TRPCNotFoundError } from '../../rpc/errors';
import { zReport } from './report.constants';

// Grid coordinates, so whole numbers inside the grid. A zero width or a
// height in the tens of thousands is a client bug, not a layout.
const GRID_MAX_COLUMNS = 12;
const GRID_MAX_ROWS = 1000;
const zGridSpan = z.number().int().min(1).max(GRID_MAX_COLUMNS);
const zReportLayout = z.object({
  x: z.number().int().min(0).max(GRID_MAX_COLUMNS),
  y: z.number().int().min(0).max(GRID_MAX_ROWS),
  w: zGridSpan,
  h: z.number().int().min(1).max(GRID_MAX_ROWS),
  minW: zGridSpan.optional(),
  minH: z.number().int().min(1).max(GRID_MAX_ROWS).optional(),
  maxW: zGridSpan.optional(),
  maxH: z.number().int().min(1).max(GRID_MAX_ROWS).optional(),
});

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

  updateLayout: protectedProcedure
    .input(
      z.object({
        reportId: z.string(),
        layout: zReportLayout,
      })
    )
    .mutation(async ({ input: { reportId, layout }, ctx }) => {
      const dbReport = await ctx.services.report.getReportByIdOrThrow(reportId);
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: dbReport.projectId,
        level: 'write',
      });
      return ctx.services.report.updateReportLayout({ reportId, layout });
    }),

  resetLayout: protectedProcedure
    .input(
      z.object({
        dashboardId: z.string(),
        projectId: z.string(),
      })
    )
    .mutation(async ({ input: { dashboardId, projectId }, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId,
        level: 'write',
      });

      // The access check above only proves the caller owns `projectId`. Bind
      // the caller-supplied `dashboardId` to that project as well before
      // deleting anything, otherwise a dashboard from another organization
      // can be wiped through this handler.
      const dashboard = await ctx.services.dashboard.getDashboardById(
        dashboardId,
        projectId
      );
      if (!dashboard) {
        throw new TRPCNotFoundError('Dashboard not found');
      }

      return ctx.services.report.resetReportLayouts({
        dashboardId,
        projectId,
      });
    }),
});
