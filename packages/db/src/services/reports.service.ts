import { alphabetIds, lineTypes, timeRanges } from '@openpanel/constants';
import type {
  IChartBreakdown,
  IChartEvent,
  IChartEventFilter,
  IChartInput,
  IChartLineType,
  IChartRange,
} from '@openpanel/validation';

import { db } from '../prisma-client';
import type { Report as DbReport } from '../prisma-client';

export type IServiceReport = Awaited<ReturnType<typeof getReportById>>;

export function transformFilter(
  filter: Partial<IChartEventFilter>,
  index: number
): IChartEventFilter {
  return {
    id: filter.id ?? alphabetIds[index] ?? 'A',
    name: filter.name ?? 'Unknown Filter',
    operator: filter.operator ?? 'is',
    value:
      typeof filter.value === 'string' ? [filter.value] : filter.value ?? [],
  };
}

export function transformReportEvent(
  event: Partial<IChartEvent>,
  index: number
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
  report: DbReport
): IChartInput & { id: string } {
  return {
    id: report.id,
    projectId: report.project_id,
    events: (report.events as IChartEvent[]).map(transformReportEvent),
    breakdowns: report.breakdowns as IChartBreakdown[],
    chartType: report.chart_type,
    lineType: (report.line_type as IChartLineType) ?? lineTypes.monotone,
    interval: report.interval,
    name: report.name || 'Untitled',
    range: (report.range as IChartRange) ?? timeRanges['1m'],
    previous: report.previous ?? false,
    formula: report.formula ?? undefined,
    metric: report.metric ?? 'sum',
    unit: report.unit ?? undefined,
  };
}

export function getReportsByDashboardId(dashboardId: string) {
  return db.report
    .findMany({
      where: {
        dashboard_id: dashboardId,
      },
    })
    .then((reports) => reports.map(transformReport));
}

export async function getReportById(id: string) {
  const report = await db.report.findUnique({
    where: {
      id,
    },
  });

  if (!report) {
    return null;
  }

  return transformReport(report);
}
