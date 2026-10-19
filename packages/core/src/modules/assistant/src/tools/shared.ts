import { resolveDateRange as resolveDateRangeCore } from '@openpanel/shared';
import type { IChartRange } from '../../../report/report.constants';
import { timeWindows } from '../../../report/report.constants';
import { getDatesFromRange } from '../../../report/src/chart-dates';
import type { ChatToolContext } from '../context';

/** `YYYY-MM-DD`. */
export const DATE_ONLY_LENGTH = 10;
const DEFAULT_ROW_LIMIT = 50;

const PRESET_RANGES: ReadonlySet<string> = new Set(
  Object.keys(timeWindows).filter((key) => key !== 'custom')
);

/**
 * Explicit dates win, then the window the user was looking at when the chat
 * was opened, then the last 30 days.
 */
export function resolveRange(
  ctx: ChatToolContext,
  input: { startDate?: string; endDate?: string } = {}
): { startDate: string; endDate: string } {
  if (input.startDate || input.endDate) {
    return resolveDateRangeCore(input.startDate, input.endDate);
  }
  const hint = ctx.hint;
  if (hint?.startDate || hint?.endDate) {
    return resolveDateRangeCore(hint.startDate, hint.endDate);
  }
  if (hint?.range && PRESET_RANGES.has(hint.range)) {
    return getDatesFromRange(hint.range as IChartRange, ctx.timezone);
  }
  return resolveDateRangeCore(undefined, undefined);
}

export function toDateOnly(value: string): string {
  return value.slice(0, DATE_ONLY_LENGTH);
}

/** Cap rows and say so, so the model knows there is more. */
export function truncateRows<T>(
  rows: T[],
  max = DEFAULT_ROW_LIMIT
): { rows: T[]; total: number; truncated: boolean } {
  if (rows.length <= max) {
    return { rows, total: rows.length, truncated: false };
  }
  return { rows: rows.slice(0, max), total: rows.length, truncated: true };
}

const DEFAULT_DASHBOARD_URL = 'http://localhost:3000';
const TRAILING_SLASH = /\/$/;

export function dashboardUrl(ctx: ChatToolContext, path = ''): string {
  const base = (ctx.config.dashboardUrl || DEFAULT_DASHBOARD_URL).replace(
    TRAILING_SLASH,
    ''
  );
  return `${base}/${ctx.organizationId}/${ctx.projectId}${path}`;
}

/**
 * Property keys for the model: dotted keys collapse to their root, ordered by
 * how many keys roll up under them, so dynamic `__query.<uuid>` noise cannot
 * push `country` out of the list.
 */
export function compactPropertyKeys(
  rows: Array<{ property_key: string }>,
  max = DEFAULT_ROW_LIMIT
): { properties: string[]; total: number; truncated: boolean } {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const dot = row.property_key.indexOf('.');
    const root = dot >= 0 ? row.property_key.slice(0, dot) : row.property_key;
    counts.set(root, (counts.get(root) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);
  return {
    properties: sorted.slice(0, max),
    total: sorted.length,
    truncated: sorted.length > max,
  };
}

export function errorResult(
  message: string,
  extra: Record<string, unknown> = {}
) {
  return { error: message, ...extra };
}
