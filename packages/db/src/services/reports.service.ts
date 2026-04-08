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
  IChartRange,
  IReport,
  IReportOptions,
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
): IReport & {
  id: string;
  layout?: ReportLayout | null;
} {
  const options = report.options as IReportOptions | null | undefined;

  return {
    id: report.id,
    projectId: report.projectId,
    name: report.name || 'Untitled',
    chartType: report.chartType,
    lineType: (report.lineType as IChartLineType) ?? lineTypes.monotone,
    interval: report.interval,
    series:
      (report.events as IChartEventItem[]).map(transformReportEventItem) ?? [],
    breakdowns: report.breakdowns as IChartBreakdown[],
    range:
      report.range in deprecated_timeRanges
        ? '30d'
        : (report.range as IChartRange),
    previous: report.previous ?? false,
    formula: report.formula ?? undefined,
    metric: report.metric ?? 'sum',
    unit: report.unit ?? undefined,
    layout: report.layout ?? undefined,
    options: options ?? undefined,
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

import { AggregateChartEngine, ChartEngine } from '../engine';
import { getDashboardById } from './dashboard.service';
import { getChartStartEndDate } from './date.service';
import { funnelService } from './funnel.service';
import { getSettingsForProject } from './organization.service';

export async function listReportsCore(input: {
  projectId: string;
  dashboardId: string;
  organizationId: string;
}) {
  const dashboard = await getDashboardById(input.dashboardId, input.projectId);
  if (!dashboard) {
    return [];
  }
  const reports = await getReportsByDashboardId(input.dashboardId);
  return reports.map((r) => ({
    id: r.id,
    name: r.name,
    chartType: r.chartType,
    range: r.range,
    interval: r.interval,
    metric: r.metric,
    series: r.series.map((s) =>
      s.type === 'formula'
        ? { type: 'formula', id: s.id, formula: s.formula }
        : { type: 'event', id: s.id, name: s.name, displayName: s.displayName, segment: s.segment },
    ),
    breakdowns: r.breakdowns,
  }));
}

export async function getReportDataCore(input: {
  projectId: string;
  reportId: string;
  organizationId: string;
}) {
  const report = await getReportById(input.reportId);

  if (!report) {
    throw new Error(`Report not found: ${input.reportId}`);
  }

  if (report.projectId !== input.projectId) {
    throw new Error(`Report does not belong to this project: ${input.reportId}`);
  }

  const { timezone } = await getSettingsForProject(input.projectId);
  const { startDate, endDate } = getChartStartEndDate(report, timezone);
  const chartInput = { ...report, startDate, endDate, timezone };

  const meta = {
    id: report.id,
    name: report.name,
    chartType: report.chartType,
    range: report.range,
    interval: report.interval,
    startDate,
    endDate,
  };

  if (report.chartType === 'funnel') {
    const result = await funnelService.getFunnel(chartInput);
    return { ...meta, data: result };
  }

  if (report.chartType === 'metric') {
    const result = await AggregateChartEngine.execute(chartInput);
    return { ...meta, data: result };
  }

  const result = await ChartEngine.execute(chartInput);
  return { ...meta, data: result };
}
