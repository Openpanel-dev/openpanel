import {
  AggregateChartEngine,
  ChartEngine,
  funnelService,
  getChartStartEndDate,
  getDashboardById,
  getReportsByDashboardId,
  getSettingsForProject,
} from '@openpanel/db';
import type { IChartRange, IInterval } from '@openpanel/validation';
import { z } from 'zod';
import { chatTool, dashboardUrl } from './helpers';

// Cap on parallel report execution. Real dashboards rarely exceed this,
// but we don't want a runaway 100-report dashboard to blow our 30s tool
// timeout or hammer ClickHouse with one request.
const MAX_REPORTS_PER_SUMMARY = 30;

export const summarizeDashboard = chatTool(
  {
    name: 'summarize_dashboard',
    description: [
      'Run every report on the current dashboard in parallel and return their data so you can summarize, compare, or explain the dashboard as a whole. Reads dashboardId from the active page context — only works when the user is viewing a dashboard.',
      '',
      'Honors the dashboard-level range/interval picker (the OverviewRange + OverviewInterval at the top of the page) so each report runs against the window the user is currently looking at, not its saved default.',
      '',
      'Returns: { dashboard, reports: [{ id, name, chartType, startDate, endDate, data | error }] }. Use this once and synthesize across the results — do NOT also call get_report_data for the same reports.',
    ].join('\n'),
    schema: z.object({}),
  },
  async (_input, context) => {
    const dashboardId = context.pageContext?.ids?.dashboardId;
    if (!dashboardId) {
      return {
        error:
          'No dashboard in current page context. Ask the user to open a dashboard, or use list_dashboards + list_reports + get_report_data instead.',
      };
    }

    const dashboard = await getDashboardById(dashboardId, context.projectId);
    if (!dashboard) {
      return { error: 'Dashboard not found', dashboardId };
    }

    const allReports = await getReportsByDashboardId(dashboardId);
    const meta = {
      id: dashboard.id,
      name: dashboard.name,
      dashboard_url: dashboardUrl(
        context.organizationId,
        context.projectId,
        `/dashboards/${dashboard.id}`,
      ),
    };

    if (allReports.length === 0) {
      return { dashboard: meta, reports: [], note: 'Dashboard has no reports.' };
    }

    const reports = allReports.slice(0, MAX_REPORTS_PER_SUMMARY);
    const truncated = allReports.length > MAX_REPORTS_PER_SUMMARY;

    const { timezone } = await getSettingsForProject(context.projectId);

    const filters = context.pageContext?.filters;
    const overrideRange = filters?.range as IChartRange | undefined;
    const overrideStart = filters?.startDate;
    const overrideEnd = filters?.endDate;
    const overrideInterval = filters?.interval as IInterval | undefined;

    const results = await Promise.all(
      reports.map(async (report) => {
        try {
          // Apply the dashboard's global range picker to each report.
          // If both startDate + endDate are set, that wins; otherwise
          // the preset range is used. Mirrors how ReportItem behaves
          // when the page-level range/interval flow into a report.
          const useCustom = !!(overrideStart && overrideEnd);
          const merged = {
            ...report,
            ...(useCustom
              ? {
                  range: 'custom' as IChartRange,
                  startDate: overrideStart,
                  endDate: overrideEnd,
                }
              : overrideRange
                ? { range: overrideRange, startDate: null, endDate: null }
                : {}),
            ...(overrideInterval ? { interval: overrideInterval } : {}),
          };

          const { startDate, endDate } = getChartStartEndDate(merged, timezone);
          const chartInput = { ...merged, startDate, endDate, timezone };

          let data: unknown;
          if (report.chartType === 'funnel') {
            data = await funnelService.getFunnel(
              chartInput as Parameters<typeof funnelService.getFunnel>[0],
            );
          } else if (report.chartType === 'metric') {
            data = await AggregateChartEngine.execute(chartInput);
          } else {
            data = await ChartEngine.execute(chartInput);
          }

          return {
            id: report.id,
            name: report.name,
            chartType: report.chartType,
            interval: chartInput.interval,
            startDate,
            endDate,
            data,
          };
        } catch (err) {
          return {
            id: report.id,
            name: report.name,
            chartType: report.chartType,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    return {
      dashboard: meta,
      reports: results,
      ...(truncated
        ? {
            _truncated: true,
            note: `Dashboard has ${allReports.length} reports; only the first ${MAX_REPORTS_PER_SUMMARY} were summarized.`,
          }
        : {}),
    };
  },
);
