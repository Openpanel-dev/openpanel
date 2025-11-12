import { z } from 'zod';

import { db, getReportById, getReportsByDashboardId } from '@openpanel/db';
import { zReportInput } from '@openpanel/validation';

import { getProjectAccess } from '../access';
import { TRPCAccessError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const reportRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        dashboardId: z.string(),
        projectId: z.string(),
      }),
    )
    .query(async ({ input: { dashboardId, projectId }, ctx }) => {
      return getReportsByDashboardId(dashboardId);
    }),
  create: protectedProcedure
    .input(
      z.object({
        report: zReportInput.omit({ projectId: true }),
        dashboardId: z.string(),
      }),
    )
    .mutation(async ({ input: { report, dashboardId }, ctx }) => {
      const dashboard = await db.dashboard.findUniqueOrThrow({
        where: {
          id: dashboardId,
        },
      });

      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: dashboard.projectId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      return db.report.create({
        data: {
          projectId: dashboard.projectId,
          dashboardId,
          name: report.name,
          events: report.events,
          interval: report.interval,
          breakdowns: report.breakdowns,
          chartType: report.chartType,
          lineType: report.lineType,
          range: report.range === 'custom' ? '30d' : report.range,
          formula: report.formula,
          previous: report.previous ?? false,
          unit: report.unit,
          criteria: report.criteria,
          metric: report.metric === 'count' ? 'sum' : report.metric,
          funnelGroup: report.funnelGroup,
          funnelWindow: report.funnelWindow,
        },
      });
    }),
  update: protectedProcedure
    .input(
      z.object({
        reportId: z.string(),
        report: zReportInput.omit({ projectId: true }),
      }),
    )
    .mutation(async ({ input: { report, reportId }, ctx }) => {
      const dbReport = await db.report.findUniqueOrThrow({
        where: {
          id: reportId,
        },
      });

      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: dbReport.projectId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      return db.report.update({
        where: {
          id: reportId,
        },
        data: {
          name: report.name,
          events: report.events,
          interval: report.interval,
          breakdowns: report.breakdowns,
          chartType: report.chartType,
          lineType: report.lineType,
          range: report.range === 'custom' ? '30d' : report.range,
          formula: report.formula,
          previous: report.previous ?? false,
          unit: report.unit,
          criteria: report.criteria,
          metric: report.metric === 'count' ? 'sum' : report.metric,
          funnelGroup: report.funnelGroup,
          funnelWindow: report.funnelWindow,
        },
      });
    }),
  delete: protectedProcedure
    .input(
      z.object({
        reportId: z.string(),
      }),
    )
    .mutation(async ({ input: { reportId }, ctx }) => {
      const report = await db.report.findUniqueOrThrow({
        where: {
          id: reportId,
        },
      });

      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: report.projectId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      return db.report.delete({
        where: {
          id: reportId,
        },
      });
    }),
  duplicate: protectedProcedure
    .input(
      z.object({
        reportId: z.string(),
      }),
    )
    .mutation(async ({ input: { reportId }, ctx }) => {
      const report = await db.report.findUniqueOrThrow({
        where: {
          id: reportId,
        },
      });

      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: report.projectId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      return db.report.create({
        data: {
          projectId: report.projectId,
          dashboardId: report.dashboardId,
          name: `Copy of ${report.name}`,
          events: report.events!,
          interval: report.interval,
          breakdowns: report.breakdowns!,
          chartType: report.chartType,
          lineType: report.lineType,
          range: report.range,
          formula: report.formula,
          previous: report.previous,
          unit: report.unit,
          criteria: report.criteria,
          metric: report.metric,
          funnelGroup: report.funnelGroup,
          funnelWindow: report.funnelWindow,
        },
      });
    }),
  get: protectedProcedure
    .input(
      z.object({
        reportId: z.string(),
      }),
    )
    .query(async ({ input: { reportId }, ctx }) => {
      return getReportById(reportId);
    }),
  updateLayout: protectedProcedure
    .input(
      z.object({
        reportId: z.string(),
        layout: z.object({
          x: z.number(),
          y: z.number(),
          w: z.number(),
          h: z.number(),
          minW: z.number().optional(),
          minH: z.number().optional(),
          maxW: z.number().optional(),
          maxH: z.number().optional(),
        }),
      }),
    )
    .mutation(async ({ input: { reportId, layout }, ctx }) => {
      const report = await db.report.findUniqueOrThrow({
        where: {
          id: reportId,
        },
      });

      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: report.projectId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      // Upsert the layout (create if doesn't exist, update if it does)
      return db.reportLayout.upsert({
        where: {
          reportId: reportId,
        },
        create: {
          reportId: reportId,
          x: layout.x,
          y: layout.y,
          w: layout.w,
          h: layout.h,
          minW: layout.minW,
          minH: layout.minH,
          maxW: layout.maxW,
          maxH: layout.maxH,
        },
        update: {
          x: layout.x,
          y: layout.y,
          w: layout.w,
          h: layout.h,
          minW: layout.minW,
          minH: layout.minH,
          maxW: layout.maxW,
          maxH: layout.maxH,
        },
      });
    }),
  getLayouts: protectedProcedure
    .input(
      z.object({
        dashboardId: z.string(),
        projectId: z.string(),
      }),
    )
    .query(async ({ input: { dashboardId, projectId }, ctx }) => {
      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: projectId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      return db.reportLayout.findMany({
        where: {
          report: {
            dashboardId: dashboardId,
          },
        },
        include: {
          report: true,
        },
      });
    }),
  resetLayout: protectedProcedure
    .input(
      z.object({
        dashboardId: z.string(),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input: { dashboardId, projectId }, ctx }) => {
      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: projectId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      // Delete all layout data for reports in this dashboard
      return db.reportLayout.deleteMany({
        where: {
          report: {
            dashboardId: dashboardId,
          },
        },
      });
    }),
});
