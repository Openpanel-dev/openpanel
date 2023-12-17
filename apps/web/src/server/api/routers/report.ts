import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { db } from '@/server/db';
import { getDashboardBySlug } from '@/server/services/dashboard.service';
import { getProjectBySlug } from '@/server/services/project.service';
import type {
  IChartBreakdown,
  IChartEvent,
  IChartEventFilter,
  IChartInput,
  IChartRange,
} from '@/types';
import { alphabetIds } from '@/utils/constants';
import { zChartInput } from '@/utils/validation';
import type { Report as DbReport } from '@prisma/client';
import { z } from 'zod';

function transformFilter(
  filter: Partial<IChartEventFilter>,
  index: number
): IChartEventFilter {
  return {
    id: filter.id ?? alphabetIds[index]!,
    name: filter.name ?? 'Unknown Filter',
    operator: filter.operator ?? 'is',
    value:
      typeof filter.value === 'string' ? [filter.value] : filter.value ?? [],
  };
}

function transformEvent(
  event: Partial<IChartEvent>,
  index: number
): IChartEvent {
  return {
    segment: event.segment ?? 'event',
    filters: (event.filters ?? []).map(transformFilter),
    id: event.id ?? alphabetIds[index]!,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    name: event.name || 'Untitled',
  };
}

function transformReport(report: DbReport): IChartInput & { id: string } {
  return {
    id: report.id,
    events: (report.events as IChartEvent[]).map(transformEvent),
    breakdowns: report.breakdowns as IChartBreakdown[],
    chartType: report.chart_type,
    interval: report.interval,
    name: report.name || 'Untitled',
    range: (report.range as IChartRange) ?? 30,
  };
}

export const reportRouter = createTRPCRouter({
  get: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(({ input: { id } }) => {
      return db.report
        .findUniqueOrThrow({
          where: {
            id,
          },
        })
        .then(transformReport);
    }),
  list: protectedProcedure
    .input(
      z.object({
        projectSlug: z.string(),
        dashboardSlug: z.string(),
      })
    )
    .query(async ({ input: { projectSlug, dashboardSlug } }) => {
      const project = await getProjectBySlug(projectSlug);
      const dashboard = await getDashboardBySlug(dashboardSlug);
      const reports = await db.report.findMany({
        where: {
          project_id: project.id,
          dashboard_id: dashboard.id,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return {
        reports: reports.map(transformReport),
        dashboard,
      };
    }),
  save: protectedProcedure
    .input(
      z.object({
        report: zChartInput,
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
          project_id: dashboard.project_id,
          dashboard_id: dashboardId,
          name: report.name,
          events: report.events,
          interval: report.interval,
          breakdowns: report.breakdowns,
          chart_type: report.chartType,
          range: report.range,
        },
      });
    }),
  update: protectedProcedure
    .input(
      z.object({
        reportId: z.string(),
        report: zChartInput,
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
          chart_type: report.chartType,
          range: report.range,
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
