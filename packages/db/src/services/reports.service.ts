import {
  alphabetIds,
  deprecated_timeRanges,
  lineTypes,
} from '@openpanel/constants';
import type {
  IChartBreakdown,
  IChartEvent,
  IChartEventFilter,
  IChartLineType,
  IChartProps,
  IChartRange,
  ICriteria,
} from '@openpanel/validation';

import { db } from '../prisma-client';
import type { Report as DbReport, ReportLayout } from '../prisma-client';

export type IServiceReport = Awaited<ReturnType<typeof getReportById>>;

export function transformFilter(
  filter: Partial<IChartEventFilter>,
  index: number,
): IChartEventFilter {
  return {
    id: filter.id ?? alphabetIds[index] ?? 'A',
    name: filter.name ?? 'Unknown Filter',
    operator: filter.operator ?? 'is',
    value:
      typeof filter.value === 'string' ? [filter.value] : (filter.value ?? []),
  };
}

export function transformReportEvent(
  event: Partial<IChartEvent>,
  index: number,
): IChartEvent {
  return {
    segment: event.segment ?? 'event',
    filters: (event.filters ?? []).map(transformFilter),
    id: event.id ?? alphabetIds[index]!,
    name: event.name || 'unknown_event',
    displayName: event.displayName,
    property: event.property,
  };
}

export function transformReport(
  report: DbReport & { layout?: ReportLayout | null },
): IChartProps & { id: string; layout?: ReportLayout | null } {
  return {
    id: report.id,
    projectId: report.projectId,
    events: (report.events as IChartEvent[]).map(transformReportEvent),
    breakdowns: report.breakdowns as IChartBreakdown[],
    chartType: report.chartType,
    lineType: (report.lineType as IChartLineType) ?? lineTypes.monotone,
    interval: report.interval,
    name: report.name || 'Untitled',
    range:
      report.range in deprecated_timeRanges
        ? '30d'
        : (report.range as IChartRange),
    previous: report.previous ?? false,
    formula: report.formula ?? undefined,
    metric: report.metric ?? 'sum',
    unit: report.unit ?? undefined,
    criteria: (report.criteria as ICriteria) ?? undefined,
    funnelGroup: report.funnelGroup ?? undefined,
    funnelWindow: report.funnelWindow ?? undefined,
    layout: report.layout ?? undefined,
  };
}

export function getReportsByDashboardId(dashboardId: string) {
  return db.report
    .findMany({
      where: {
        dashboardId,
      },
      include: {
        layout: true,
      },
    })
    .then((reports) => reports.map(transformReport));
}

export async function getReportById(id: string) {
  const report = await db.report.findUnique({
    where: {
      id,
    },
    include: {
      layout: true,
    },
  });

  if (!report) {
    return null;
  }

  return transformReport(report);
}
