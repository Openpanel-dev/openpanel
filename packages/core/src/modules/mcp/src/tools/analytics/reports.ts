import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CoreConfig } from '../../../../../config';
import type { ServiceDeps } from '../../../../../services';
import {
  executeAggregateChart,
  executeChart,
} from '../../../../chart/chart.service';
import { getFunnel } from '../../../../chart/funnel.service';
import { getSettingsForProject } from '../../../../organization/organization.service';
import {
  getReportById,
  getReportsByDashboardId,
} from '../../../../report/report.service';
import { getChartStartEndDate } from '../../../../report/src/chart-dates';
import { requireDashboard } from '../dashboard-access';
import { dashboardBaseUrl } from '../dashboard-links';
import {
  MAX_SERIES_POINTS,
  type McpToolDeps,
  projectIdSchema,
  resolveProjectId,
  table,
  withErrorHandling,
  zLimit,
} from '../shared';

const DEFAULT_SERIES_LIMIT = 25;
const MAX_SERIES_LIMIT = 200;
/** How many series get their full per-date values in the pivoted `data` block. */
const DEFAULT_PLOTTED_SERIES = 5;
const MAX_PLOTTED_SERIES = 25;

function reportUrl(
  config: CoreConfig,
  organizationId: string,
  projectId: string,
  reportId: string
) {
  return `${dashboardBaseUrl(config)}/${organizationId}/${projectId}/reports/${reportId}`;
}

function dashboardUrl(
  config: CoreConfig,
  organizationId: string,
  projectId: string,
  dashboardId: string
) {
  return `${dashboardBaseUrl(config)}/${organizationId}/${projectId}/dashboards/${dashboardId}`;
}

type ChartSeries = {
  id: string;
  names: string[];
  metrics: {
    sum: number;
    average: number;
    min: number;
    max: number;
    count?: number;
  };
  data: Array<{ date: string; count: number }>;
};

/**
 * Reshape a chart result into something a reader can hold in their head.
 *
 * The raw `FinalChart` is one object per point per series: a breakdown report
 * with 50 series over 90 days is 4,500 `{date, count, previous}` objects — a
 * few hundred kilobytes to describe a picture. Two structures replace it:
 *
 *  - a `series` table, one row per series with its summary metrics, so nothing
 *    is silently dropped from the ranking; and
 *  - a `data` block pivoted to `date × series`, covering only the top few
 *    series, which is the densest honest form of a multi-series time chart.
 */
function shapeChart(
  chart: { series: ChartSeries[]; metrics: unknown },
  options: { seriesLimit: number; plotSeries: number }
) {
  const { seriesLimit, plotSeries } = options;
  const summaries = chart.series.map((serie) => ({
    name: serie.names.join(' / '),
    sum: serie.metrics.sum,
    average: serie.metrics.average,
    min: serie.metrics.min,
    max: serie.metrics.max,
  }));

  const plotted = chart.series.slice(0, plotSeries);

  // The engine zero-fills every series onto the same date grid, but take the
  // union anyway so a short series can't silently truncate the axis.
  const dates: string[] = [];
  const seenDates = new Set<string>();
  for (const serie of plotted) {
    for (const point of serie.data) {
      if (seenDates.has(point.date)) {
        continue;
      }
      seenDates.add(point.date);
      dates.push(point.date);
    }
  }
  dates.sort();

  const trimmedDates =
    dates.length > MAX_SERIES_POINTS
      ? dates.slice(dates.length - MAX_SERIES_POINTS)
      : dates;

  const byDate = plotted.map((serie) => {
    const lookup = new Map(
      serie.data.map((point) => [point.date, point.count])
    );
    return lookup;
  });

  return {
    metrics: chart.metrics,
    series: table(summaries, {
      limit: seriesLimit,
      columns: ['name', 'sum', 'average', 'min', 'max'],
      sum: ['sum'],
      sortedBy: 'sum',
      unit: 'series',
    }),
    data: {
      columns: ['date', ...plotted.map((serie) => serie.names.join(' / '))],
      rows: trimmedDates.map((date) => [
        date,
        ...byDate.map((lookup) => lookup.get(date) ?? 0),
      ]),
      ...(chart.series.length > plotted.length ||
      dates.length > trimmedDates.length
        ? {
            note: [
              chart.series.length > plotted.length
                ? `Per-date values shown for the top ${plotted.length} of ${chart.series.length} series (raise \`plotSeries\`); every series still appears in the \`series\` summary table.`
                : null,
              dates.length > trimmedDates.length
                ? `Showing the most recent ${trimmedDates.length} of ${dates.length} intervals.`
                : null,
            ]
              .filter(Boolean)
              .join(' '),
          }
        : {}),
    },
  };
}

export function registerReportTools(
  server: McpServer,
  { context, deps }: McpToolDeps
) {
  server.tool(
    'list_dashboards',
    'List all dashboards for a project. Returns dashboard IDs and names. Use these IDs with list_reports to see what reports each dashboard contains.',
    {
      projectId: projectIdSchema(context),
    },
    async ({ projectId: inputProjectId }) =>
      withErrorHandling(deps, async () => {
        const projectId = await resolveProjectId(deps, context, inputProjectId);
        const db = deps.db;
        const dashboards = await db.dashboard.findMany({
          where: { projectId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, projectId: true },
        });
        return dashboards.map((d) => ({
          ...d,
          dashboard_url: dashboardUrl(
            deps.config,
            context.organizationId,
            projectId,
            d.id
          ),
        }));
      })
  );

  server.tool(
    'list_reports',
    'List all reports in a dashboard. Returns report IDs, names, chart types, and the events/metrics they track. Use get_report_data to execute a report and retrieve its actual data. Build a link for any row by substituting its `id` into the returned `report_url_template`.',
    {
      projectId: projectIdSchema(context),
      dashboardId: z.string().describe('The dashboard ID to list reports for'),
    },
    async ({ projectId: inputProjectId, dashboardId }) =>
      withErrorHandling(deps, async () => {
        const projectId = await resolveProjectId(deps, context, inputProjectId);
        // Bind the id to the project BEFORE reading, the way every other
        // dashboard/report tool here does: the post-hoc check this replaced
        // let a foreign dashboard holding zero reports answer with a normal
        // empty table instead of an error.
        await requireDashboard(deps, projectId, dashboardId);
        const reports = await getReportsByDashboardId(deps, dashboardId);
        const rows = reports.map((r) => ({
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
        return {
          report_url_template: `${dashboardBaseUrl(deps.config)}/${context.organizationId}/${projectId}/reports/{id}`,
          ...table(rows, {
            limit: MAX_SERIES_LIMIT,
            columns: [
              'id',
              'name',
              'chartType',
              'range',
              'interval',
              'metric',
              'series',
              'breakdowns',
            ],
            unit: 'reports',
          }),
        };
      })
  );

  server.tool(
    'get_report_data',
    'Execute a saved report and return its data. Works for all chart types: linear/bar/area/pie/map (time-series or breakdowns), metric (aggregate numbers), and funnel (conversion steps). Time-series results come back as a `series` summary table plus a `data` block pivoted to date × series for the highest-volume series. Pass the report ID from list_reports.',
    {
      projectId: projectIdSchema(context),
      reportId: z.string().describe('The report ID to execute'),
      seriesLimit: zLimit(DEFAULT_SERIES_LIMIT, MAX_SERIES_LIMIT),
      plotSeries: z
        .number()
        .int()
        .min(1)
        .max(MAX_PLOTTED_SERIES)
        .optional()
        .describe(
          `How many of the top series get per-date values in the \`data\` block (default ${DEFAULT_PLOTTED_SERIES}, max ${MAX_PLOTTED_SERIES}). Every series appears in the summary table regardless.`
        ),
    },
    async ({ projectId: inputProjectId, reportId, seriesLimit, plotSeries }) =>
      withErrorHandling(deps, async () => {
        const projectId = await resolveProjectId(deps, context, inputProjectId);
        const result = await runReport(deps, {
          organizationId: context.organizationId,
          projectId,
          reportId,
        });

        if ('error' in result) {
          return result;
        }

        // Funnel and metric results are already small and have their own shape;
        // only the multi-series charts need reshaping.
        const chart = result.data as {
          series?: ChartSeries[];
          metrics?: unknown;
        };
        if (
          result.chartType === 'funnel' ||
          result.chartType === 'metric' ||
          !Array.isArray(chart.series)
        ) {
          return result;
        }

        const { data: _raw, ...meta } = result;
        return {
          ...meta,
          ...shapeChart(chart as { series: ChartSeries[]; metrics: unknown }, {
            seriesLimit: seriesLimit ?? DEFAULT_SERIES_LIMIT,
            plotSeries: plotSeries ?? DEFAULT_PLOTTED_SERIES,
          }),
        };
      })
  );
}

/**
 * Execute a saved report by ID. Dispatches on chart type:
 *  - funnel  → getFunnel
 *  - metric  → AggregateChartEngine.execute
 *  - others  → ChartEngine.execute
 *
 * The assistant module (`../../assistant/src/report-runner.ts`, M5-005)
 * carries its own copy of this dispatch for its in-app chat tools — ADR-007
 * explicitly defers unifying MCP's tool definitions with assistant's (M5-007),
 * so the two live as hand-synced copies rather than a shared helper.
 * Deliberately returns the raw engine output here — the MCP tool reshapes it
 * for LLM consumption, the chat renderer needs the full chart.
 */
async function runReport(
  deps: ServiceDeps,
  input: {
    organizationId: string;
    projectId: string;
    reportId: string;
  }
): Promise<
  | { error: string; reportId: string }
  | {
      id: string;
      name: string;
      chartType: string;
      range: string;
      interval: string;
      startDate: string;
      endDate: string;
      dashboard_url: string;
      data: unknown;
    }
> {
  const report = await getReportById(deps, input.reportId);

  if (!report) {
    return { error: 'Report not found', reportId: input.reportId };
  }

  if (report.projectId !== input.projectId) {
    return {
      error: 'Report does not belong to this project',
      reportId: input.reportId,
    };
  }

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
    dashboard_url: reportUrl(
      deps.config,
      input.organizationId,
      input.projectId,
      input.reportId
    ),
  };

  if (report.chartType === 'funnel') {
    return { ...meta, data: await getFunnel(deps, chartInput) };
  }
  if (report.chartType === 'metric') {
    return { ...meta, data: await executeAggregateChart(deps, chartInput) };
  }
  return { ...meta, data: await executeChart(deps, chartInput) };
}
