import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { zChartInput } from "@/utils/validation";
import { dateDifferanceInDays, getDaysOldDate } from "@/utils/date";
import { db } from "@/server/db";
import {
  type IChartInput,
  type IChartBreakdown,
  type IChartEvent,
} from "@/types";
import { type Report as DbReport } from "@prisma/client";
import { getProjectBySlug } from "@/server/services/project.service";
import { getDashboardBySlug } from "@/server/services/dashboard.service";

function transform(report: DbReport): IChartInput & { id: string } {
  return {
    id: report.id,
    events: report.events as IChartEvent[],
    breakdowns: report.breakdowns as IChartBreakdown[],
    startDate: getDaysOldDate(report.range),
    endDate: new Date(),
    chartType: report.chart_type,
    interval: report.interval,
    name: report.name,
  };
}

export const reportRouter = createTRPCRouter({
  get: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(({ input: { id } }) => {
      return db.report
        .findUniqueOrThrow({
          where: {
            id,
          },
        })
        .then(transform);
    }),
  list: protectedProcedure
    .input(
      z.object({
        projectSlug: z.string(),
        dashboardSlug: z.string(),
      }),
    )
    .query(async ({ input: { projectSlug, dashboardSlug } }) => {
      const project = await getProjectBySlug(projectSlug);
      const dashboard = await getDashboardBySlug(dashboardSlug);
      const reports = await db.report.findMany({
        where: {
          project_id: project.id,
          dashboard_id: dashboard.id,
        },
      });

      return {
        reports: reports.map(transform),
        dashboard,
      }
    }),
  save: protectedProcedure
    .input(
      z.object({
        report: zChartInput,
        projectId: z.string(),
        dashboardId: z.string(),
      }),
    )
    .mutation(({ input: { report, projectId, dashboardId } }) => {
      return db.report.create({
        data: {
          project_id: projectId,
          dashboard_id: dashboardId,
          name: report.name,
          events: report.events,
          interval: report.interval,
          breakdowns: report.breakdowns,
          chart_type: report.chartType,
          range: dateDifferanceInDays(report.endDate, report.startDate),
        },
      });
    }),
  update: protectedProcedure
    .input(
      z.object({
        reportId: z.string(),
        report: zChartInput,
        projectId: z.string(),
        dashboardId: z.string(),
      }),
    )
    .mutation(({ input: { report, projectId, dashboardId, reportId } }) => {
      return db.report.update({
        where: {
          id: reportId,
        },
        data: {
          project_id: projectId,
          dashboard_id: dashboardId,
          name: report.name,
          events: report.events,
          interval: report.interval,
          breakdowns: report.breakdowns,
          chart_type: report.chartType,
          range: dateDifferanceInDays(report.endDate, report.startDate),
        },
      });
    }),
});
