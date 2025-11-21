import {
  alphabetIds,
  deprecated_timeRanges,
  lineTypes,
} from '@openpanel/constants';
import type {
  IChartBreakdown,
  IChartEvent,
  IChartEventFilter,
  IChartEventItem,
  IChartFormula,
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

export function transformReportEventItem(
  item: Partial<IChartEventItem> | Partial<IChartEvent>,
  index: number,
): IChartEventItem {
  // If item already has type field, it's the new format
  if (item && typeof item === 'object' && 'type' in item) {
    if (item.type === 'formula') {
      // Transform formula
      const formula = item as Partial<IChartFormula>;
      return {
        type: 'formula',
        id: formula.id ?? alphabetIds[index]!,
        formula: formula.formula || '',
        displayName: formula.displayName,
      };
    }
    // Transform event with type field
    const event = item as Partial<IChartEvent>;
    return {
      type: 'event',
      segment: event.segment ?? 'event',
      filters: (event.filters ?? []).map(transformFilter),
      id: event.id ?? alphabetIds[index]!,
      name: event.name || 'unknown_event',
      displayName: event.displayName,
      property: event.property,
    };
  }

  // Old format without type field - assume it's an event
  const event = item as Partial<IChartEvent>;
  return {
    type: 'event',
    segment: event.segment ?? 'event',
    filters: (event.filters ?? []).map(transformFilter),
    id: event.id ?? alphabetIds[index]!,
    name: event.name || 'unknown_event',
    displayName: event.displayName,
    property: event.property,
  };
}

// Keep the old function for backward compatibility, but it now uses the new transformer
export function transformReportEvent(
  event: Partial<IChartEvent>,
  index: number,
): IChartEvent {
  const transformed = transformReportEventItem(event, index);
  if (transformed.type === 'event') {
    return transformed;
  }
  // This shouldn't happen for old code, but handle it gracefully
  throw new Error('transformReportEvent called on a formula');
}

export function transformReport(
  report: DbReport & { layout?: ReportLayout | null },
): IChartProps & { id: string; layout?: ReportLayout | null } {
  // Events can be either old format (IChartEvent[]) or new format (IChartEventItem[])
  const eventsData = report.events as unknown as Array<
    Partial<IChartEventItem> | Partial<IChartEvent>
  >;

  return {
    id: report.id,
    projectId: report.projectId,
    series: eventsData.map(transformReportEventItem),
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
