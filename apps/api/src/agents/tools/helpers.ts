import {
  type AgentToolDefinition,
  defineTool,
  type ToolRunContext,
} from '@better-agent/core';
import {
  getDatesFromRange,
  resolveDateRange as resolveDateRangeCore,
} from '@openpanel/db';
import type { IChartEventFilter, IChartRange } from '@openpanel/validation';
import type { z } from 'zod';
import type { ChatAgentContext, PageContext } from '../context';
import { chatRunContext } from '../run-context';

/** Max time a single tool handler is allowed to run. */
const TOOL_TIMEOUT_MS = 30_000;

/**
 * Thin wrapper around `defineTool().server()` that bakes in our typed
 * agent context and enforces a time ceiling. Three things this gives
 * us over the raw API:
 *
 *  1. The agent's `contextSchema` only types itself — `defineTool` has
 *     no idea which agent it'll be bound to, so its `runCtx.context`
 *     is `unknown`. We cast it to `ChatAgentContext` here so every
 *     handler sees a typed context.
 *  2. The handler input is `any` (validated at runtime by Zod). We
 *     deliberately don't try to infer it from the schema generic —
 *     mixing TInput inference with the `BivariantFn` parameter shape
 *     hits TypeScript's "type instantiation is excessively deep" limit
 *     and breaks. Tools that need typed input destructure with an
 *     inline annotation, or use `z.infer<typeof mySchema>`.
 *  3. A 30-second timeout wraps every handler. A slow ClickHouse query
 *     or a stalled external fetch would otherwise hold the turn for
 *     the full latency of the tool. We throw with a known shape so
 *     the agent sees a clear "tool took too long" message and can
 *     decide whether to retry with narrower params or move on.
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
    runCtx: ToolRunContext,
  ) => Promise<unknown>,
): AgentToolDefinition {
  // biome-ignore lint/suspicious/noExplicitAny: see block comment above
  const contract: any = defineTool({
    name: config.name,
    description: config.description,
    schema: config.schema,
  });
  return contract.server(
    async (input: unknown, runCtx: ToolRunContext) => {
      const work = handler(
        input,
        runCtx.context as ChatAgentContext,
        runCtx,
      );
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `Tool "${config.name}" timed out after ${TOOL_TIMEOUT_MS / 1000}s`,
            ),
          );
        }, TOOL_TIMEOUT_MS);
      });
      try {
        return await Promise.race([work, timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  ) as AgentToolDefinition;
}

/**
 * Cap an array result to `max` items and append a truncation marker so the
 * frontend renderer + the LLM both know there's more data.
 */
export function truncateRows<T>(
  rows: T[],
  max = 500,
): { rows: T[]; total: number; _truncated: boolean } {
  if (rows.length <= max) {
    return { rows, total: rows.length, _truncated: false };
  }
  return { rows: rows.slice(0, max), total: rows.length, _truncated: true };
}

/**
 * Compact output from `listEventPropertiesCore` for consumption by the LLM.
 *
 * The raw shape is `{ properties: [{ property_key, event_name }, …] }` ordered
 * alphabetically and capped at 500 rows. That shape has three token-hungry
 * problems when passed back as a tool result:
 *
 *   1. Dotted sub-keys explode. A single property like `__query` or `data`
 *      with dynamic sub-paths surfaces as hundreds of rows
 *      (`__query.foo`, `__query.bar`, `__query.<uuid>`, …). They flood
 *      alphabetically-first — 300 of them before `country` appears.
 *   2. `event_name` is repeated on every row. When the caller passed an
 *      `eventName` filter it's a constant string; we only need it once.
 *   3. The full 500-row dump is rarely necessary — the model uses this
 *      list for filter/breakdown discovery, which is satisfied by the
 *      top ~50 distinct roots.
 *
 * This helper collapses dotted keys to their root segment, dedupes, orders
 * by frequency (how many original sub-keys fell under each root — a decent
 * "how prominent is this property" signal), and caps the list.
 */
export function compactEventProperties(
  raw: { properties: Array<{ property_key: string; event_name: string }> },
  options: { eventName?: string; max?: number } = {},
): {
  event_name?: string;
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
    properties: truncated ? sorted.slice(0, max) : sorted,
    total: sorted.length,
    _truncated: truncated,
  };
}

/**
 * Known range presets that map to date windows via `getDatesFromRange`.
 * Anything outside this set (including `"custom"`) is treated as "no
 * preset" and we fall through to explicit dates / the 30-day default.
 */
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
 * Resolve a date range from `PageContext.filters`.
 *
 * Precedence:
 *   1. Explicit `startDate` + `endDate` → use as-is (either one alone
 *      falls back to the other via `resolveDateRangeCore`).
 *   2. `range` is a known preset (`"7d"`, `"6m"`, …) → expand via
 *      `getDatesFromRange(range, projectTimezone)` so a preset-only
 *      URL (as set by the dashboard's `useOverviewOptions`) produces
 *      the same window the dashboard is displaying.
 *   3. Nothing → default to the last 30 days (via
 *      `resolveDateRangeCore`).
 *
 * Timezone comes from `chatRunContext` (populated by the Fastify
 * wrapper once per request). Outside that context we fall back to UTC
 * — only relevant in tests / direct calls.
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
 * Extract `IChartEventFilter[]` from the chat's page context. The
 * context schema keeps filters loose (Zod `record`), but the frontend
 * always ships the real chart-filter shape — so we cast here. Invalid
 * entries (missing `name`) are dropped defensively.
 *
 * Tools use this so the assistant sees the user's active filters ("I
 * see you're filtered to mobile") instead of returning project-wide
 * numbers that contradict the dashboard.
 */
export function pageContextFilters(
  pageContext: ChatAgentContext['pageContext'],
): IChartEventFilter[] {
  const raw = pageContext?.filters?.eventFilters;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (f): f is IChartEventFilter =>
      typeof (f as { name?: unknown })?.name === 'string',
  );
}

/**
 * Compute the immediately-preceding period given a (start, end) range.
 */
export function previousPeriod(startDate: string, endDate: string) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const span = end - start;
  return {
    startDate: new Date(start - span - 86_400_000).toISOString().slice(0, 10),
    endDate: new Date(start - 86_400_000).toISOString().slice(0, 10),
  };
}

/**
 * Build a clickable dashboard URL for a tool result.
 */
export function dashboardUrl(
  organizationId: string,
  projectId: string,
  path = '',
): string {
  const base =
    process.env.DASHBOARD_URL ||
    process.env.NEXT_PUBLIC_DASHBOARD_URL ||
    'http://localhost:3000';
  return `${base}/${organizationId}/${projectId}${path}`;
}
