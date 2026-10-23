import type { IReportInput } from '@openpanel/core/modules/report/report.constants';

export type {
  AssistantUIMessage,
  AssistantUIMessagePart,
} from '@openpanel/core';

/** What every chart-producing tool returns; the chart fetches its own data from `report`. */
export interface ChartOutput {
  title: string;
  report: IReportInput & { name: string; id?: string };
  dashboardUrl?: string;
}

export function isChartOutput(value: unknown): value is ChartOutput {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { report?: { chartType?: unknown } };
  return typeof candidate.report?.chartType === 'string';
}

export function isRowsOutput(value: unknown): value is {
  rows: Record<string, unknown>[];
  total?: number;
  truncated?: boolean;
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const rows = (value as { rows?: unknown }).rows;
  return (
    Array.isArray(rows) &&
    rows.every((row) => typeof row === 'object' && row !== null)
  );
}

export function isErrorOutput(value: unknown): value is { error: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { error?: unknown }).error === 'string'
  );
}
