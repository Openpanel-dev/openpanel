// Moved from packages/db/src/services/reports.service.ts, plus the
// create/update/move/delete/duplicate/layout mutation bodies
// packages/trpc/src/routers/report.ts held inline (M7-006, ADR-008's module
// map: report owns "R,S,C"). packages/db/src/services/reports.service.ts
// stays a re-export shim (DELEGATE PATTERN), same shape as
// project.service.ts since M6-002.

import type {
  Report as DbReport,
  ReportLayout,
} from '@openpanel/db/src/prisma-client';
import { getChartStartEndDate } from '@openpanel/core';
import type {
  IChartBreakdown,
  IChartEventFilter,
  IChartEventItem,
  IChartLineType,
  IChartRange,
  IReport,
  IReportOptions,
} from '@openpanel/validation';
import { TRPCBadRequestError } from '../../rpc/errors';
import { getFunnel } from '../chart/funnel.service';
import { AggregateChartEngine, ChartEngine } from '../chart/src/engine/execute';
import { getDashboardById } from '../dashboard/dashboard.service';
import { getSettingsForProject } from '../organization/organization.service';
import { alphabetIds, lineTypes } from './report.constants';

export type IServiceReport = Awaited<ReturnType<typeof getReportById>>;

// Only the Postgres client stays lazy: report.rpc.ts lands in the eager
// rpc.router.ts barrel chain nearly every core test file reaches, and
// constructing @openpanel/db's prisma-client at import time would spawn a
// pino-pretty transport worker thread per test file (see
// insight.service.ts's header / project.service.ts's header). date.service
// and the chart engine carry no db construction of their own, and the chart
// engine is already eager via chart.rpc.ts, so both stay static imports.
function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

export const onlyReportEvents = (
  series: NonNullable<IServiceReport>['series']
) => {
  return series.filter((item) => item.type === 'event');
};

/**
 * Prepend report-level global filters to every event series' own filters.
 * Combining is AND (filters already combine with AND in getEventFiltersWhereClause).
 * Formulas reference other series, so they inherit the global filters transitively
 * and are left untouched here.
 */
export function mergeGlobalFilters(
  series: IChartEventItem[],
  globalFilters: IChartEventFilter[] = []
): IChartEventItem[] {
  if (!globalFilters.length) {
    return series;
  }
  return series.map((item) =>
    item.type === 'event'
      ? { ...item, filters: [...globalFilters, ...item.filters] }
      : item
  );
}

export function transformFilter(
  filter: Partial<IChartEventFilter>,
  index: number
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
  index: number
): IChartEventItem {
  if (item.type === 'formula') {
    // Transform formula
    return {
      type: 'formula',
      id: item.id ?? alphabetIds[index]!,
      formula: item.formula || '',
      displayName: item.displayName,
      hideSeries: item.hideSeries,
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
  report: DbReport & { layout?: ReportLayout | null }
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
    globalFilters:
      (report.globalFilters as IChartEventFilter[] | null)?.map(
        transformFilter
      ) ?? [],
    range: report.range as IChartRange,
    previous: report.previous ?? false,
    formula: report.formula ?? undefined,
    metric: report.metric ?? 'sum',
    unit: report.unit ?? undefined,
    layout: report.layout ?? undefined,
    options: options ?? undefined,
    visibleSeries: report.visibleSeries ?? undefined,
    startDate: report.startDate ?? undefined,
    endDate: report.endDate ?? undefined,
  };
}

export async function getReportsByDashboardId(dashboardId: string) {
  const db = await loadDb();
  const reports = await db.report.findMany({
    where: {
      dashboardId,
    },
    include: {
      layout: true,
    },
  });
  return reports.map(transformReport);
}

export async function getReportById(id: string) {
  const db = await loadDb();
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

/** Unscoped lookup for mutation handlers that only receive a report id and
 *  need its `projectId`/`dashboardId` to run the access check — same shape as
 *  V1's inline `db.report.findUniqueOrThrow`. */
export async function getReportByIdOrThrow(id: string) {
  const db = await loadDb();
  return db.report.findUniqueOrThrow({ where: { id } });
}

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
        : {
            type: 'event',
            id: s.id,
            name: s.name,
            displayName: s.displayName,
            segment: s.segment,
          }
    ),
    breakdowns: r.breakdowns,
  }));
}

export async function getReportDataCore(input: {
  projectId: string;
  reportId: string;
  organizationId: string;
}) {
  const db = await loadDb();
  const rawReport = await db.report.findUnique({
    where: { id: input.reportId, projectId: input.projectId },
    include: { layout: true },
  });

  if (!rawReport) {
    throw new Error(`Report not found: ${input.reportId}`);
  }

  const report = transformReport(rawReport);
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
    const result = await getFunnel(chartInput);
    return { ...meta, data: result };
  }

  if (report.chartType === 'metric') {
    const result = await AggregateChartEngine.execute(chartInput);
    return { ...meta, data: result };
  }

  const result = await ChartEngine.execute(chartInput);
  return { ...meta, data: result };
}

// -----------------------------------------------------------------------
// Mutations — moved from packages/trpc/src/routers/report.ts's handler
// bodies. Each takes the resource already fetched by report.rpc.ts for the
// access check, so the ported router does exactly one extra Prisma round
// trip fewer than re-fetching, matching V1's query count.

type IReportInputForWrite = Omit<IReport, 'projectId'>;

function reportWriteData(report: IReportInputForWrite) {
  return {
    name: report.name,
    events: report.series,
    globalFilters: report.globalFilters ?? [],
    interval: report.interval,
    breakdowns: report.breakdowns,
    chartType: report.chartType,
    lineType: report.lineType,
    range: report.range,
    formula: report.formula,
    previous: report.previous ?? false,
    unit: report.unit,
    metric: report.metric,
    options: report.options,
    visibleSeries: report.visibleSeries ?? [],
    startDate: report.range === 'custom' ? report.startDate : null,
    endDate: report.range === 'custom' ? report.endDate : null,
  };
}

export async function createReport(input: {
  dashboardId: string;
  projectId: string;
  report: IReportInputForWrite;
}) {
  const db = await loadDb();
  return db.report.create({
    data: {
      projectId: input.projectId,
      dashboardId: input.dashboardId,
      ...reportWriteData(input.report),
    },
  });
}

export async function updateReport(input: {
  reportId: string;
  report: IReportInputForWrite;
}) {
  const db = await loadDb();
  return db.report.update({
    where: {
      id: input.reportId,
    },
    data: reportWriteData(input.report),
  });
}

export async function moveReport(input: {
  report: DbReport;
  dashboardId: string;
}) {
  const db = await loadDb();
  const { report, dashboardId } = input;

  if (report.dashboardId === dashboardId) {
    throw new TRPCBadRequestError('Report is already on this dashboard');
  }

  const dashboard = await db.dashboard.findUniqueOrThrow({
    where: {
      id: dashboardId,
    },
  });

  // A report keeps its own projectId and that is what powers the chart
  // queries, public shares included. Moving it to a dashboard in another
  // project would expose the source project through the target project.
  if (dashboard.projectId !== report.projectId) {
    throw new TRPCBadRequestError(
      'You can only move a report to a dashboard in the same project'
    );
  }

  const [, moved] = await db.$transaction([
    // The layout belongs to the report, not the dashboard. Keeping it would
    // drop the report on top of whatever already sits at those coordinates
    // in the target dashboard.
    db.reportLayout.deleteMany({
      where: {
        reportId: report.id,
      },
    }),
    db.report.update({
      where: {
        id: report.id,
      },
      data: {
        dashboardId,
      },
    }),
  ]);

  return moved;
}

export async function deleteReport(reportId: string) {
  const db = await loadDb();
  return db.report.delete({
    where: {
      id: reportId,
    },
  });
}

export async function duplicateReport(report: DbReport) {
  const db = await loadDb();
  return db.report.create({
    data: {
      projectId: report.projectId,
      dashboardId: report.dashboardId,
      name: `Copy of ${report.name}`,
      events: report.events!,
      globalFilters: report.globalFilters ?? [],
      interval: report.interval,
      breakdowns: report.breakdowns!,
      chartType: report.chartType,
      lineType: report.lineType,
      range: report.range,
      formula: report.formula,
      previous: report.previous,
      unit: report.unit,
      metric: report.metric,
      options: report.options,
      visibleSeries: report.visibleSeries,
      startDate: report.startDate,
      endDate: report.endDate,
    },
  });
}

interface ReportLayoutInput {
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export async function updateReportLayout(input: {
  reportId: string;
  layout: ReportLayoutInput;
}) {
  const db = await loadDb();
  const { reportId, layout } = input;

  // Upsert the layout (create if doesn't exist, update if it does)
  return db.reportLayout.upsert({
    where: {
      reportId,
    },
    create: {
      reportId,
      ...layout,
    },
    update: layout,
  });
}

export async function getReportLayouts(input: {
  dashboardId: string;
  projectId: string;
}) {
  const db = await loadDb();
  return db.reportLayout.findMany({
    where: {
      report: {
        dashboardId: input.dashboardId,
        projectId: input.projectId,
      },
    },
    include: {
      report: true,
    },
  });
}

export async function resetReportLayouts(input: {
  dashboardId: string;
  projectId: string;
}) {
  const db = await loadDb();
  return db.reportLayout.deleteMany({
    where: {
      report: {
        dashboardId: input.dashboardId,
        projectId: input.projectId,
      },
    },
  });
}
