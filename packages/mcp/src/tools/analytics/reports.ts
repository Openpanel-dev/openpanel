import {
  AggregateChartEngine,
  ChartEngine,
  db,
  funnelService,
  getChartStartEndDate,
  getReportById,
  getReportsByDashboardId,
  getSettingsForProject,
} from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import { dashboardBaseUrl } from '../dashboard-links';
import {
  projectIdSchema,
  resolveProjectId,
  withErrorHandling,
} from '../shared';

function reportUrl(
  organizationId: string,
  projectId: string,
  reportId: string,
) {
  return `${dashboardBaseUrl()}/${organizationId}/${projectId}/reports/${reportId}`;
}

function dashboardUrl(
  organizationId: string,
  projectId: string,
  dashboardId: string,
) {
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
        const projectId = resolveProjectId(context, inputProjectId);
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
        const projectId = resolveProjectId(context, inputProjectId);
        const reports = await getReportsByDashboardId(dashboardId);
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
        const projectId = resolveProjectId(context, inputProjectId);
        const report = await getReportById(reportId);

        if (!report) {
          return { error: 'Report not found', reportId };
        }

        if (report.projectId !== projectId) {
          return { error: 'Report does not belong to this project', reportId };
        }

        const { timezone } = await getSettingsForProject(projectId);
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
          dashboard_url: reportUrl(context.organizationId, projectId, reportId),
        };

        if (report.chartType === 'funnel') {
          const result = await funnelService.getFunnel(chartInput);
          return { ...meta, data: result };
        }

        if (report.chartType === 'metric') {
          const result = await AggregateChartEngine.execute(chartInput);
          return { ...meta, data: result };
        }

        // linear, bar, histogram, pie, area, map, etc.
        const result = await ChartEngine.execute(chartInput);
        return { ...meta, data: result };
      }),
  );
}
