import {
  type AgentToolDefinition,
  defineTool,
  type ToolRunContext,
} from '@better-agent/core';
import { resolveDateRange as resolveDateRangeCore } from '@openpanel/shared';
import type { z } from 'zod';
import type { CoreConfig } from '../../../../config';
import type {
  IChartEventFilter,
  IChartRange,
} from '../../../report/report.constants';
import { getDatesFromRange } from '../../../report/src/chart-dates';
import type { ChatAgentContext, PageContext } from '../context';
import { chatRunContext } from '../run-context';

/** Max time a single tool handler is allowed to run. */
const TOOL_TIMEOUT_MS = 30_000;

/**
 * Wrapper around `defineTool().server()` that types the agent context and
 * enforces a time ceiling.
 *
 * - `defineTool` does not know which agent it is bound to, so `runCtx.context`
 *   is `unknown`; it is cast to `ChatAgentContext` here.
 * - The handler input is `any` (validated at runtime by Zod): inferring it from
 *   the schema generic hits TypeScript's "type instantiation is excessively
 *   deep" limit. Tools that need typed input annotate it inline or use
 *   `z.infer`.
 * - A 30-second timeout wraps every handler so a slow query or stalled fetch
 *   cannot hold the turn; the agent gets a clear "tool took too long" error.
 *   It bounds the TURN, not the work: the race abandons the handler, so the
 *   query behind a timed-out tool keeps running on the server.
 */
export function chatTool(
  config: {
    name: string;
    description: string;
    schema: z.ZodTypeAny;
  },
  handler: (
    // biome-ignore lint/suspicious/noExplicitAny: deliberate, see comment above
    input: any,
    ctx: ChatAgentContext,
    runCtx: ToolRunContext
  ) => Promise<unknown>
): AgentToolDefinition {
  // biome-ignore lint/suspicious/noExplicitAny: see block comment above
  const contract: any = defineTool({
    name: config.name,
    description: config.description,
    schema: config.schema,
  });
  return contract.server(async (input: unknown, runCtx: ToolRunContext) => {
    const work = handler(input, runCtx.context as ChatAgentContext, runCtx);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `Tool "${config.name}" timed out after ${TOOL_TIMEOUT_MS / 1000}s`
          )
        );
      }, TOOL_TIMEOUT_MS);
    });
    try {
      return await Promise.race([work, timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }) as AgentToolDefinition;
}

/** Cap an array result to `max` items and append a truncation marker so the renderer and the LLM know there is more. */
export function truncateRows<T>(
  rows: T[],
  max = 500
): { rows: T[]; total: number; _truncated: boolean } {
  if (rows.length <= max) {
    return { rows, total: rows.length, _truncated: false };
  }
  return { rows: rows.slice(0, max), total: rows.length, _truncated: true };
}

/**
 * Compact `listEventPropertiesCore` output for the LLM. `columns` are top-level
 * event columns, used bare in filters; `properties` are keys of the JSON
 * `properties` map, used as `properties.<key>`.
 *
 * The raw rows are alphabetical and capped at 500, so a property with dynamic
 * sub-paths (`__query.<uuid>`, ...) can flood the list before `country`
 * appears. This collapses dotted keys to their root, dedupes, orders by
 * frequency and keeps the ~50 roots the model needs.
 */
export function compactEventProperties(
  raw: {
    columns: readonly string[];
    properties: Array<{ property_key: string; event_name: string }>;
  },
  options: { eventName?: string; max?: number } = {}
): {
  event_name?: string;
  columns: readonly string[];
  properties: string[];
  total: number;
  _truncated: boolean;
} {
  const { eventName, max = 50 } = options;
  const counts = new Map<string, number>();
  for (const row of raw.properties) {
    const dot = row.property_key.indexOf('.');
    const root = dot >= 0 ? row.property_key.slice(0, dot) : row.property_key;
    counts.set(root, (counts.get(root) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);
  const truncated = sorted.length > max;
  return {
    ...(eventName ? { event_name: eventName } : {}),
    columns: raw.columns,
    properties: truncated ? sorted.slice(0, max) : sorted,
    total: sorted.length,
    _truncated: truncated,
  };
}

/** Range presets `getDatesFromRange` understands; anything else (including `"custom"`) falls through to explicit dates or the 30-day default. */
const PRESET_RANGES: ReadonlySet<IChartRange> = new Set([
  '30min',
  'lastHour',
  'today',
  'yesterday',
  '7d',
  '30d',
  '6m',
  '12m',
  'monthToDate',
  'lastMonth',
  'yearToDate',
  'lastYear',
]);

/**
 * Resolve a date range from `PageContext.filters`: explicit start/end dates
 * first, then a known preset expanded in the project timezone (so a
 * preset-only URL gives the window the dashboard shows), else the last 30
 * days. The timezone comes from `chatRunContext`, UTC outside it (tests).
 */
export function resolveDateRange(filters?: PageContext['filters']): {
  startDate: string;
  endDate: string;
} {
  if (filters?.startDate || filters?.endDate) {
    return resolveDateRangeCore(filters.startDate, filters.endDate);
  }

  const range = filters?.range as IChartRange | undefined;
  if (range && PRESET_RANGES.has(range)) {
    const timezone = chatRunContext.getStore()?.timezone ?? 'UTC';
    return getDatesFromRange(range, timezone);
  }

  return resolveDateRangeCore(undefined, undefined);
}

/**
 * Extract `IChartEventFilter[]` from the page context so the assistant sees the
 * user's active filters instead of returning project-wide numbers that
 * contradict the dashboard. The context schema keeps filters loose, so this
 * casts and drops entries without a `name`.
 */
export function pageContextFilters(
  pageContext: ChatAgentContext['pageContext']
): IChartEventFilter[] {
  const raw = pageContext?.filters?.eventFilters;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (f): f is IChartEventFilter =>
      typeof (f as { name?: unknown })?.name === 'string'
  );
}

export function previousPeriod(startDate: string, endDate: string) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const span = end - start;
  return {
    startDate: new Date(start - span - 86_400_000).toISOString().slice(0, 10),
    endDate: new Date(start - 86_400_000).toISOString().slice(0, 10),
  };
}

/** Where a dev box's dashboard runs when DASHBOARD_URL is not set. */
const DEFAULT_DASHBOARD_URL = 'http://localhost:3000';

export function dashboardUrl(
  config: CoreConfig,
  organizationId: string,
  projectId: string,
  path = ''
): string {
  const base = config.dashboardUrl || DEFAULT_DASHBOARD_URL;
  return `${base}/${organizationId}/${projectId}${path}`;
}
