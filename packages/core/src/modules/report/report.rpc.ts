// Ported from packages/trpc/src/routers/report.ts (M7-006).
//
// Same arrangement as chart.rpc.ts/project.rpc.ts: V1's `protectedProcedure`
// lands in core with auth (rpc/base.ts), so each procedure does its own "is
// anyone logged in" + `requireProjectAccess` check. The mutation bodies
// (create/update/move/delete/duplicate/layout) moved to ./report.service
// alongside the reads that already lived there; packages/trpc's report
// router delegates every handler body onto ./report.service while keeping
// V1's own procedure stack (DELEGATE PATTERN).

import { z } from 'zod';
import { createTRPCRouter, procedure, type TrpcContext } from '../../rpc/base';
import { TRPCAccessError, TRPCNotFoundError } from '../../rpc/errors';
import {
  getDashboardById,
  getDashboardByIdOrThrow,
} from '../dashboard/dashboard.service';
import { zReport } from './report.constants';
import {
  createReport,
  deleteReport,
  duplicateReport,
  getReportById,
  getReportByIdOrThrow,
  getReportLayouts,
  getReportsByDashboardId,
  moveReport,
  resetReportLayouts,
  updateReport,
  updateReportLayout,
} from './report.service';

const zReportLayout = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  minW: z.number().optional(),
  minH: z.number().optional(),
  maxW: z.number().optional(),
  maxH: z.number().optional(),
});

function loadAccessChecks() {
  return import('./src/access');
}

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

async function requireAccess(
  userId: string,
  projectId: string,
  level: 'read' | 'write'
) {
  const { requireProjectAccess } = await loadAccessChecks();
  await requireProjectAccess({ userId, projectId, level });
}

async function requireReadAccess(ctx: TrpcContext, projectId: string) {
  await requireAccess(requireLogin(ctx.session.userId), projectId, 'read');
}

async function requireWriteAccess(ctx: TrpcContext, projectId: string) {
  await requireAccess(requireLogin(ctx.session.userId), projectId, 'write');
}

export const reportRouter = createTRPCRouter({
  list: procedure
    .input(
      z.object({
        dashboardId: z.string(),
        projectId: z.string(),
      })
    )
    .query(async ({ input: { dashboardId, projectId }, ctx }) => {
      requireLogin(ctx.session.userId);
      const dashboard = await getDashboardById(dashboardId, projectId);
      if (!dashboard) {
        throw new TRPCNotFoundError('Dashboard not found');
      }
      return getReportsByDashboardId(dashboardId);
    }),

  create: procedure
    .input(
      z.object({
        report: zReport.omit({ projectId: true }),
        dashboardId: z.string(),
      })
    )
    .mutation(async ({ input: { report, dashboardId }, ctx }) => {
      const dbDashboard = await getDashboardByIdOrThrow(dashboardId);
      await requireWriteAccess(ctx, dbDashboard.projectId);
      return createReport({
        dashboardId,
        projectId: dbDashboard.projectId,
        report,
      });
    }),

  update: procedure
    .input(
      z.object({
        reportId: z.string(),
        report: zReport.omit({ projectId: true }),
      })
    )
    .mutation(async ({ input: { report, reportId }, ctx }) => {
      const dbReport = await getReportByIdOrThrow(reportId);
      await requireWriteAccess(ctx, dbReport.projectId);
      return updateReport({ reportId, report });
    }),

  move: procedure
    .input(
      z.object({
        reportId: z.string(),
        dashboardId: z.string(),
      })
    )
    .mutation(async ({ input: { reportId, dashboardId }, ctx }) => {
      const dbReport = await getReportByIdOrThrow(reportId);
      await requireWriteAccess(ctx, dbReport.projectId);
      return moveReport({ report: dbReport, dashboardId });
    }),

  delete: procedure
    .input(
      z.object({
        reportId: z.string(),
      })
    )
    .mutation(async ({ input: { reportId }, ctx }) => {
      const dbReport = await getReportByIdOrThrow(reportId);
      await requireWriteAccess(ctx, dbReport.projectId);
      return deleteReport(reportId);
    }),

  duplicate: procedure
    .input(
      z.object({
        reportId: z.string(),
      })
    )
    .mutation(async ({ input: { reportId }, ctx }) => {
      const dbReport = await getReportByIdOrThrow(reportId);
      await requireWriteAccess(ctx, dbReport.projectId);
      return duplicateReport(dbReport);
    }),

  get: procedure
    .input(
      z.object({
        reportId: z.string(),
      })
    )
    .query(async ({ input: { reportId }, ctx }) => {
      const report = await getReportById(reportId);
      if (!report) {
        throw new TRPCNotFoundError('Report not found');
      }
      await requireReadAccess(ctx, report.projectId);
      return report;
    }),

  updateLayout: procedure
    .input(
      z.object({
        reportId: z.string(),
        layout: zReportLayout,
      })
    )
    .mutation(async ({ input: { reportId, layout }, ctx }) => {
      const dbReport = await getReportByIdOrThrow(reportId);
      await requireWriteAccess(ctx, dbReport.projectId);
      return updateReportLayout({ reportId, layout });
    }),

  getLayouts: procedure
    .input(
      z.object({
        dashboardId: z.string(),
        projectId: z.string(),
      })
    )
    .query(async ({ input: { dashboardId, projectId }, ctx }) => {
      await requireReadAccess(ctx, projectId);

      // The access check above only proves the caller owns `projectId`. Bind
      // the caller-supplied `dashboardId` to that project as well, otherwise a
      // dashboard from another organization can be read through this handler.
      const dashboard = await getDashboardById(dashboardId, projectId);
      if (!dashboard) {
        throw new TRPCNotFoundError('Dashboard not found');
      }

      return getReportLayouts({ dashboardId, projectId });
    }),

  resetLayout: procedure
    .input(
      z.object({
        dashboardId: z.string(),
        projectId: z.string(),
      })
    )
    .mutation(async ({ input: { dashboardId, projectId }, ctx }) => {
      await requireWriteAccess(ctx, projectId);

      // Same as `getLayouts`: bind the dashboard to the access-checked project
      // before deleting anything, so a foreign dashboard cannot be wiped.
      const dashboard = await getDashboardById(dashboardId, projectId);
      if (!dashboard) {
        throw new TRPCNotFoundError('Dashboard not found');
      }

      return resetReportLayouts({ dashboardId, projectId });
    }),
});
