import { z } from 'zod';
import type { ServiceDeps } from '../../../../services';
import {
  executeAggregateChart,
  executeChart,
} from '../../../chart/chart.service';
import { getFunnel } from '../../../chart/funnel.service';
import { getDashboardById } from '../../../dashboard/dashboard.service';
import { getSettingsForProject } from '../../../organization/organization.service';
import type { IChartRange, IInterval } from '../../../report/report.constants';
import { getReportsByDashboardId } from '../../../report/report.service';
import { getChartStartEndDate } from '../../../report/src/chart-dates';
import { chatTool, dashboardUrl } from './helpers';

// Caps parallel report execution so a huge dashboard cannot blow the 30s tool
// timeout or hammer ClickHouse.
const MAX_REPORTS_PER_SUMMARY = 30;

export const summarizeDashboard = (deps: ServiceDeps) =>
  chatTool(
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

      const dashboard = await getDashboardById(
        deps,
        dashboardId,
        context.projectId
      );
      if (!dashboard) {
        return { error: 'Dashboard not found', dashboardId };
      }

      const allReports = await getReportsByDashboardId(deps, dashboardId);
      const meta = {
        id: dashboard.id,
        name: dashboard.name,
        dashboard_url: dashboardUrl(
          deps.config,
          context.organizationId,
          context.projectId,
          `/dashboards/${dashboard.id}`
        ),
      };

      if (allReports.length === 0) {
        return {
          dashboard: meta,
          reports: [],
          note: 'Dashboard has no reports.',
        };
      }

      const reports = allReports.slice(0, MAX_REPORTS_PER_SUMMARY);
      const truncated = allReports.length > MAX_REPORTS_PER_SUMMARY;

      const { timezone } = await getSettingsForProject(deps, context.projectId);

      const filters = context.pageContext?.filters;
      const overrideRange = filters?.range as IChartRange | undefined;
      const overrideStart = filters?.startDate;
      const overrideEnd = filters?.endDate;
      const overrideInterval = filters?.interval as IInterval | undefined;

      const results = await Promise.all(
        reports.map(async (report) => {
          try {
            // The dashboard's global range applies to each report; explicit
            // start+end dates win over the preset.
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

            const { startDate, endDate } = getChartStartEndDate(
              merged,
              timezone
            );
            const chartInput = { ...merged, startDate, endDate, timezone };

            let data: unknown;
            if (report.chartType === 'funnel') {
              data = await getFunnel(
                deps,
                chartInput as Parameters<typeof getFunnel>[1]
              );
            } else if (report.chartType === 'metric') {
              data = await executeAggregateChart(deps, chartInput);
            } else {
              data = await executeChart(deps, chartInput);
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
        })
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
    }
  );
