import {
  AggregateChartEngine,
  ChartEngine,
  db,
  funnelService,
  getChartStartEndDate,
  getReportById,
  getReportsByDashboardId,
  getSettingsForProject} from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import { dashboardBaseUrl } from '../dashboard-links';
import { projectIdSchema, resolveProjectId, withErrorHandling } from '../shared';

function reportUrl(organizationId: string, projectId: string, reportId: string) {
  return `${dashboardBaseUrl()}/${organizationId}/${projectId}/reports/${reportId}`;
}

function dashboardUrl(organizationId: string, projectId: string, dashboardId: string) {
  return `${dashboardBaseUrl()}/${organizationId}/${projectId}/dashboards/${dashboardId}`;
}

export function registerReportTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'list_dashboards',
    'List all dashboards for a project. Returns dashboard IDs and names. Use these IDs with list_reports to see what reports each dashboard contains.',
    {
      projectId: projectIdSchema(context),
    },
    async ({ projectId: inputProjectId }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const dashboards = await db.dashboard.findMany({
          where: { projectId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, projectId: true },
        });
        return dashboards.map((d) => ({
          ...d,
          dashboard_url: dashboardUrl(context.organizationId, projectId, d.id),
        }));
      }),
  );

  server.tool(
    'list_reports',
    'List all reports in a dashboard. Returns report IDs, names, chart types, and the events/metrics they track. Use get_report_data to execute a report and retrieve its actual data.',
    {
      projectId: projectIdSchema(context),
      dashboardId: z.string().describe('The dashboard ID to list reports for'),
    },
    async ({ projectId: inputProjectId, dashboardId }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const reports = await getReportsByDashboardId(dashboardId);
        if (reports.some((r) => r.projectId !== projectId)) {
          throw new Error('Dashboard does not belong to this project');
        }
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
                },
          ),
          breakdowns: r.breakdowns,
          dashboard_url: reportUrl(context.organizationId, projectId, r.id),
        }));
      }),
  );

  server.tool(
    'get_report_data',
    'Execute a saved report and return its data. Works for all chart types: linear/bar/area/pie/map (time-series or breakdowns), metric (aggregate numbers), and funnel (conversion steps). Pass the report ID from list_reports.',
    {
      projectId: projectIdSchema(context),
      reportId: z.string().describe('The report ID to execute'),
    },
    async ({ projectId: inputProjectId, reportId }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        return runReport({ organizationId: context.organizationId, projectId, reportId });
      }),
  );
}

/**
 * Execute a saved report by ID. Dispatches on chart type:
 *  - funnel  → funnelService.getFunnel
 *  - metric  → AggregateChartEngine.execute
 *  - others  → ChartEngine.execute
 *
 * Exported so the in-app chat (apps/api/src/chat/tools/base.ts) can reuse the
 * dispatch without going through MCP.
 */
export async function runReport(input: {
  organizationId: string;
  projectId: string;
  reportId: string;
}): Promise<
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
  const report = await getReportById(input.reportId);

  if (!report) {
    return { error: 'Report not found', reportId: input.reportId };
  }

  if (report.projectId !== input.projectId) {
    return { error: 'Report does not belong to this project', reportId: input.reportId };
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
    dashboard_url: reportUrl(input.organizationId, input.projectId, input.reportId),
  };

  if (report.chartType === 'funnel') {
    return { ...meta, data: await funnelService.getFunnel(chartInput) };
  }
  if (report.chartType === 'metric') {
    return { ...meta, data: await AggregateChartEngine.execute(chartInput) };
  }
  return { ...meta, data: await ChartEngine.execute(chartInput) };
}

/**
 * Execute an ad-hoc report config (no DB lookup — config is supplied directly).
 * Used by `generate_report` tool in chat.
 */
export async function runReportFromConfig(input: {
  organizationId: string;
  projectId: string;
  /** Full zReportInput shape, with required startDate/endDate */
  config: {
    chartType: string;
    interval: string;
    startDate: string;
    endDate: string;
    [key: string]: unknown;
  };
}): Promise<{
  chartType: string;
  interval: string;
  startDate: string;
  endDate: string;
  report: typeof input.config & { projectId: string };
  data: unknown;
}> {
  const { timezone } = await getSettingsForProject(input.projectId);
  const chartInput = {
    ...input.config,
    projectId: input.projectId,
    timezone,
  } as unknown as Parameters<typeof ChartEngine.execute>[0];

  const meta = {
    chartType: input.config.chartType,
    interval: input.config.interval,
    startDate: input.config.startDate,
    endDate: input.config.endDate,
    report: { ...input.config, projectId: input.projectId },
  };

  if (input.config.chartType === 'funnel') {
    return { ...meta, data: await funnelService.getFunnel(chartInput as Parameters<typeof funnelService.getFunnel>[0]) };
  }
  if (input.config.chartType === 'metric') {
    return { ...meta, data: await AggregateChartEngine.execute(chartInput) };
  }
  return { ...meta, data: await ChartEngine.execute(chartInput) };
}
