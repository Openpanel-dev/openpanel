import {
  alphabetIds,
  deprecated_timeRanges,
  lineTypes,
} from '@openpanel/constants';
import type {
  IChartBreakdown,
  IChartEventFilter,
  IChartEventItem,
  IChartLineType,
  IChartProps,
  IChartRange,
  ICriteria,
} from '@openpanel/validation';

import type { Report as DbReport, ReportLayout } from '../prisma-client';
import { db } from '../prisma-client';

export type IServiceReport = Awaited<ReturnType<typeof getReportById>>;

export const onlyReportEvents = (
  series: NonNullable<IServiceReport>['series'],
) => {
  return series.filter((item) => item.type === 'event');
};

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

export function transformReportEventItem(
  item: IChartEventItem,
  index: number,
): IChartEventItem {
  if (item.type === 'formula') {
    // Transform formula
    return {
      type: 'formula',
      id: item.id ?? alphabetIds[index]!,
      formula: item.formula || '',
      displayName: item.displayName,
    };
  }

  // Transform event with type field
  return {
    type: 'event',
    segment: item.segment ?? 'event',
    filters: (item.filters ?? []).map(transformFilter),
    id: item.id ?? alphabetIds[index]!,
    name: item.name || 'unknown_event',
    displayName: item.displayName,
    property: item.property,
  };
}

export function transformReport(
  report: DbReport & { layout?: ReportLayout | null },
): IChartProps & { id: string; layout?: ReportLayout | null } {
  return {
    id: report.id,
    projectId: report.projectId,
    series:
      (report.events as IChartEventItem[]).map(transformReportEventItem) ?? [],
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
