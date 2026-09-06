// Ported from packages/mcp/src/tools/analytics/reports.ts's `runReport` /
// `runReportFromConfig` (M5-005).
//
// V1's apps/api/src/agents/tools/{base,report}.ts called these two functions
// straight out of `@openpanel/mcp` — a working cross-package reuse, but one
// core cannot inherit: `@openpanel/mcp` already depends on `@openpanel/core`
// (its auth + session-manager modules), so core importing `@openpanel/mcp`
// back would be a real package cycle (the same shape cohort.service.ts's
// header documents for the now-deleted `@openpanel/queue`). ADR-007 also
// explicitly defers unifying MCP's tool definitions with assistant's, so
// reaching into mcp is not the fix either.
//
// The result is a second copy of this dispatch logic, which is exactly the
// "four independent wrapper layers over the same 34 *Core functions"
// TARGET_ARCHITECTURE already records as accepted technical debt — this
// becomes a third layer, not a new problem. Both copies call the same
// @openpanel/db primitives and must be kept in sync by hand until that debt
// is paid down.

import { getChartStartEndDate } from '../../../shared/date';
import {
  AggregateChartEngine,
  ChartEngine,
  getFunnel,
  getReportById,
  getSettingsForProject,
} from '../../../v1-compat';

function reportUrl(
  organizationId: string,
  projectId: string,
  reportId: string
): string {
  const base = (
    process.env.DASHBOARD_URL ||
    process.env.NEXT_PUBLIC_DASHBOARD_URL ||
    'https://dashboard.openpanel.dev'
  ).replace(/\/$/, '');
  return `${base}/${organizationId}/${projectId}/reports/${reportId}`;
}

/**
 * Execute a saved report by ID. Dispatches on chart type:
 *  - funnel  → getFunnel
 *  - metric  → AggregateChartEngine.execute
 *  - others  → ChartEngine.execute
 *
 * Deliberately returns the raw engine output — the chat renderer needs the
 * full chart, unlike MCP's copy which reshapes it for LLM consumption.
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
    return {
      error: 'Report does not belong to this project',
      reportId: input.reportId,
    };
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
    dashboard_url: reportUrl(
      input.organizationId,
      input.projectId,
      input.reportId
    ),
  };

  if (report.chartType === 'funnel') {
    return { ...meta, data: await getFunnel(chartInput) };
  }
  if (report.chartType === 'metric') {
    return { ...meta, data: await AggregateChartEngine.execute(chartInput) };
  }
  return { ...meta, data: await ChartEngine.execute(chartInput) };
}

/**
 * Execute an ad-hoc report config (no DB lookup — config is supplied
 * directly). Used by the `generate_report` / `preview_report_with_changes`
 * chat tools.
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
    return {
      ...meta,
      data: await getFunnel(chartInput as Parameters<typeof getFunnel>[0]),
    };
  }
  if (input.config.chartType === 'metric') {
    return { ...meta, data: await AggregateChartEngine.execute(chartInput) };
  }
  return { ...meta, data: await ChartEngine.execute(chartInput) };
}
