import { z } from 'zod';

import { db } from '@openpanel/db';
import { zReportInput } from '@openpanel/validation';

import { createTRPCRouter, protectedProcedure } from '../trpc';

export const reportRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        report: zReportInput.omit({ projectId: true }),
        dashboardId: z.string(),
      })
    )
    .mutation(async ({ input: { report, dashboardId } }) => {
      const dashboard = await db.dashboard.findUniqueOrThrow({
        where: {
          id: dashboardId,
        },
      });
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
        },
      });
    }),
  update: protectedProcedure
    .input(
      z.object({
        reportId: z.string(),
        report: zReportInput.omit({ projectId: true }),
      })
    )
    .mutation(({ input: { report, reportId } }) => {
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
        },
      });
    }),
  delete: protectedProcedure
    .input(
      z.object({
        reportId: z.string(),
      })
    )
    .mutation(({ input: { reportId } }) => {
      return db.report.delete({
        where: {
          id: reportId,
        },
      });
    }),
});
