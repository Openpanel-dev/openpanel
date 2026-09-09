// Ported from packages/mcp/src/tools/analytics/reports.ts's `runReport` /
// `runReportFromConfig` (M5-005).
//
// ADR-007 explicitly defers unifying MCP's tool definitions with assistant's,
// so `modules/mcp/src/tools/analytics/reports.ts` keeps its own copy of this
// dispatch — reaching into another module's tool tree is not the fix.
//
// The result is a second copy of this dispatch logic, which is exactly the
// "four independent wrapper layers over the same 34 *Core functions"
// TARGET_ARCHITECTURE already records as accepted technical debt — this
// becomes a third layer, not a new problem. Both copies call the same
// @openpanel/db primitives and must be kept in sync by hand until that debt
// is paid down.

import type { CoreConfig } from '../../../config';
import type { ServiceDeps } from '../../../services';
import { getChartStartEndDate } from '../../../shared/date';
import { executeAggregateChart, executeChart } from '../../chart/chart.service';
import { getFunnel } from '../../chart/funnel.service';
import { getSettingsForProject } from '../../organization/organization.service';
import { getReportById } from '../../report/report.service';

const DEFAULT_DASHBOARD_URL = 'https://dashboard.openpanel.dev';
const TRAILING_SLASH = /\/$/;

function reportUrl(
  config: CoreConfig,
  organizationId: string,
  projectId: string,
  reportId: string
): string {
  const base = (config.dashboardUrl || DEFAULT_DASHBOARD_URL).replace(
    TRAILING_SLASH,
    ''
  );
  return `${base}/${organizationId}/${projectId}/reports/${reportId}`;
}

/**
 * Execute a saved report by ID. Dispatches on chart type:
 *  - funnel  → getFunnel
 *  - metric  → executeAggregateChart
 *  - others  → executeChart
 *
 * Deliberately returns the raw engine output — the chat renderer needs the
 * full chart, unlike MCP's copy which reshapes it for LLM consumption.
 */
export async function runReport(
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

/**
 * Execute an ad-hoc report config (no DB lookup — config is supplied
 * directly). Used by the `generate_report` / `preview_report_with_changes`
 * chat tools.
 */
export async function runReportFromConfig(
  deps: ServiceDeps,
  input: {
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
  }
): Promise<{
  chartType: string;
  interval: string;
  startDate: string;
  endDate: string;
  report: typeof input.config & { projectId: string };
  data: unknown;
}> {
  const { timezone } = await getSettingsForProject(deps, input.projectId);
  const chartInput = {
    ...input.config,
    projectId: input.projectId,
    timezone,
  } as unknown as Parameters<typeof executeChart>[1];

  const meta = {
    chartType: input.config.chartType,
    interval: input.config.interval,
    startDate: input.config.startDate,
    endDate: input.config.endDate,
    report: { ...input.config, projectId: input.projectId },
  };

  if (input.config.chartType === 'funnel') {
    return {
      ...meta,
      data: await getFunnel(
        deps,
        chartInput as Parameters<typeof getFunnel>[1]
      ),
    };
  }
  if (input.config.chartType === 'metric') {
    return { ...meta, data: await executeAggregateChart(deps, chartInput) };
  }
  return { ...meta, data: await executeChart(deps, chartInput) };
}
