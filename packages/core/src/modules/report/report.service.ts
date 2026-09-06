// Moved from packages/db/src/services/reports.service.ts, plus the
// create/update/move/delete/duplicate/layout mutation bodies
// packages/trpc/src/routers/report.ts held inline (M7-006, ADR-008's module
// map: report owns "R,S,C").
//
// M10-003: every function takes `ServiceDeps` and reaches Postgres as
// `deps.db`; `loadDb()` and the `@openpanel/core` self-barrel import are
// gone — the Prisma row types below are `import type`, erased at runtime
// (docs/TECH_DEBT.md §4). `onlyReportEvents`/`mergeGlobalFilters` moved to
// ./src/series.ts — see that file for why.

import type {
  Report as DbReport,
  ReportLayout,
} from '@openpanel/db/src/prisma-client';
import { TRPCBadRequestError } from '../../rpc/errors';
import type { ServiceDeps } from '../../services';
import { getChartStartEndDate } from '../../shared/date';
import { getFunnel } from '../chart/funnel.service';
import {
  executeAggregateChart,
  executeChart,
} from '../chart/src/engine/execute';
import { getDashboardById } from '../dashboard/dashboard.service';
import { getSettingsForProject } from '../organization/organization.service';
import type {
  IChartBreakdown,
  IChartEventFilter,
  IChartEventItem,
  IChartLineType,
  IChartRange,
  IReport,
  IReportOptions,
} from './report.constants';
import { alphabetIds, lineTypes } from './report.constants';
import { mergeGlobalFilters, onlyReportEvents } from './src/series';

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

export async function getReportsByDashboardId(
  deps: ServiceDeps,
  dashboardId: string
) {
  const db = deps.db;
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

export async function getReportById(deps: ServiceDeps, id: string) {
  const db = deps.db;
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
export async function getReportByIdOrThrow(deps: ServiceDeps, id: string) {
  return deps.db.report.findUniqueOrThrow({ where: { id } });
}

export async function listReportsCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    dashboardId: string;
    organizationId: string;
  }
) {
  const dashboard = await getDashboardById(
    deps,
    input.dashboardId,
    input.projectId
  );
  if (!dashboard) {
    return [];
  }
  const reports = await getReportsByDashboardId(deps, input.dashboardId);
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

export async function getReportDataCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    reportId: string;
    organizationId: string;
  }
) {
  const rawReport = await deps.db.report.findUnique({
    where: { id: input.reportId, projectId: input.projectId },
    include: { layout: true },
  });

  if (!rawReport) {
    throw new Error(`Report not found: ${input.reportId}`);
  }

  const report = transformReport(rawReport);
  const { timezone } = await getSettingsForProject(deps, input.projectId);
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
    const result = await getFunnel(deps, chartInput);
    return { ...meta, data: result };
  }

  if (report.chartType === 'metric') {
    const result = await executeAggregateChart(deps, chartInput);
    return { ...meta, data: result };
  }

  const result = await executeChart(deps, chartInput);
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

export async function createReport(
  deps: ServiceDeps,
  input: {
    dashboardId: string;
    projectId: string;
    report: IReportInputForWrite;
  }
) {
  const db = deps.db;
  return db.report.create({
    data: {
      projectId: input.projectId,
      dashboardId: input.dashboardId,
      ...reportWriteData(input.report),
    },
  });
}

export async function updateReport(
  deps: ServiceDeps,
  input: {
    reportId: string;
    report: IReportInputForWrite;
  }
) {
  const db = deps.db;
  return db.report.update({
    where: {
      id: input.reportId,
    },
    data: reportWriteData(input.report),
  });
}

export async function moveReport(
  deps: ServiceDeps,
  input: {
    report: DbReport;
    dashboardId: string;
  }
) {
  const db = deps.db;
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

export async function deleteReport(deps: ServiceDeps, reportId: string) {
  const db = deps.db;
  return db.report.delete({
    where: {
      id: reportId,
    },
  });
}

export async function duplicateReport(deps: ServiceDeps, report: DbReport) {
  const db = deps.db;
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

export async function updateReportLayout(
  deps: ServiceDeps,
  input: {
    reportId: string;
    layout: ReportLayoutInput;
  }
) {
  const db = deps.db;
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

export async function getReportLayouts(
  deps: ServiceDeps,
  input: {
    dashboardId: string;
    projectId: string;
  }
) {
  const db = deps.db;
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

export async function resetReportLayouts(
  deps: ServiceDeps,
  input: {
    dashboardId: string;
    projectId: string;
  }
) {
  const db = deps.db;
  return db.reportLayout.deleteMany({
    where: {
      report: {
        dashboardId: input.dashboardId,
        projectId: input.projectId,
      },
    },
  });
}

// --- service ------------------------------------------------------------

export interface ReportService {
  transformFilter(
    filter: Partial<IChartEventFilter>,
    index: number
  ): IChartEventFilter;
  transformReportEventItem(
    item: IChartEventItem,
    index: number
  ): IChartEventItem;
  transformReport(
    report: DbReport & { layout?: ReportLayout | null }
  ): ReturnType<typeof transformReport>;
  mergeGlobalFilters(
    series: IChartEventItem[],
    globalFilters?: IChartEventFilter[]
  ): IChartEventItem[];
  onlyReportEvents(series: IChartEventItem[]): IChartEventItem[];
  getReportsByDashboardId(
    dashboardId: string
  ): ReturnType<typeof getReportsByDashboardId>;
  getReportById(id: string): ReturnType<typeof getReportById>;
  getReportByIdOrThrow(id: string): ReturnType<typeof getReportByIdOrThrow>;
  listReportsCore(
    input: Parameters<typeof listReportsCore>[1]
  ): ReturnType<typeof listReportsCore>;
  getReportDataCore(
    input: Parameters<typeof getReportDataCore>[1]
  ): ReturnType<typeof getReportDataCore>;
  createReport(
    input: Parameters<typeof createReport>[1]
  ): ReturnType<typeof createReport>;
  updateReport(
    input: Parameters<typeof updateReport>[1]
  ): ReturnType<typeof updateReport>;
  moveReport(
    input: Parameters<typeof moveReport>[1]
  ): ReturnType<typeof moveReport>;
  deleteReport(reportId: string): ReturnType<typeof deleteReport>;
  duplicateReport(report: DbReport): ReturnType<typeof duplicateReport>;
  updateReportLayout(
    input: Parameters<typeof updateReportLayout>[1]
  ): ReturnType<typeof updateReportLayout>;
  getReportLayouts(
    input: Parameters<typeof getReportLayouts>[1]
  ): ReturnType<typeof getReportLayouts>;
  resetReportLayouts(
    input: Parameters<typeof resetReportLayouts>[1]
  ): ReturnType<typeof resetReportLayouts>;
}

export function createReportService(deps: ServiceDeps): ReportService {
  return {
    transformFilter,
    transformReportEventItem,
    transformReport,
    mergeGlobalFilters,
    onlyReportEvents,
    getReportsByDashboardId: (dashboardId) =>
      getReportsByDashboardId(deps, dashboardId),
    getReportById: (id) => getReportById(deps, id),
    getReportByIdOrThrow: (id) => getReportByIdOrThrow(deps, id),
    listReportsCore: (input) => listReportsCore(deps, input),
    getReportDataCore: (input) => getReportDataCore(deps, input),
    createReport: (input) => createReport(deps, input),
    updateReport: (input) => updateReport(deps, input),
    moveReport: (input) => moveReport(deps, input),
    deleteReport: (reportId) => deleteReport(deps, reportId),
    duplicateReport: (report) => duplicateReport(deps, report),
    updateReportLayout: (input) => updateReportLayout(deps, input),
    getReportLayouts: (input) => getReportLayouts(deps, input),
    resetReportLayouts: (input) => resetReportLayouts(deps, input),
  };
}
