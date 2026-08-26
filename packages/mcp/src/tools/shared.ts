import { resolveClientProjectId } from '@openpanel/db';
import { createLogger } from '@openpanel/logger';
import { z } from 'zod';
import type { McpAuthContext } from '../auth';

const logger = createLogger({ name: 'mcp' });

/**
 * Resolve the effective projectId from context + optional tool input.
 * Thin adapter so tool files don't repeat the full argument object every call.
 */
export function resolveProjectId(
  context: McpAuthContext,
  inputProjectId: string | undefined,
): Promise<string> {
  return resolveClientProjectId({
    clientType: context.clientType,
    clientProjectId: context.projectId,
    organizationId: context.organizationId,
    inputProjectId,
  });
}

/**
 * Build the projectId portion of an input schema.
 *
 * - Root clients must supply a projectId per call (multi-project access).
 * - Read clients have it fixed in context — it's not included in the schema.
 */
export function projectIdSchema(context: McpAuthContext) {
  return context.projectId === null
    ? z
        .string()
        .describe(
          'Project ID to query (required for organization-level access)'
        )
    : z.string().optional();
}


/**
 * Zod schema for common date range inputs. Both fields are optional and
 * default to the last 30 days when omitted.
 */
export const zDateRange = {
  startDate: z
    .string()
    .optional()
    .describe(
      'Start date in YYYY-MM-DD format (e.g. 2024-01-01). Defaults to 30 days ago.'
    ),
  endDate: z
    .string()
    .optional()
    .describe(
      'End date in YYYY-MM-DD format (e.g. 2024-03-31). Defaults to today.'
    ),
};

/**
 * Resolve a date range, defaulting to the last 30 days if not provided.
 */
export function resolveDateRange(
  startDate?: string,
  endDate?: string
): { startDate: string; endDate: string } {
  const end = endDate ?? new Date().toISOString().slice(0, 10);
  const start =
    startDate ??
    new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  return { startDate: start, endDate: end };
}

/**
 * Standard `limit` input for any tool that returns a list.
 *
 * Every list-returning tool must expose one of these. The default is what the
 * model gets when it doesn't think about size — which is almost always — so it
 * has to be an LLM-sized number, not a dashboard-sized one.
 */
export function zLimit(defaultLimit: number, max: number) {
  return z
    .number()
    .int()
    .min(1)
    .max(max)
    .optional()
    .describe(
      `Max rows to return (default ${defaultLimit}, max ${max}). Results are ranked, so the default covers the meaningful head of the distribution; only raise it if you specifically need the long tail.`
    );
}

/**
 * Ceiling on a single serialized tool response.
 *
 * ~24k characters is roughly 6.5k tokens. A tool result is one turn's worth of
 * evidence, not a data export — past this the model starts losing the thread of
 * the actual question. `toText` enforces it as a hard backstop so no tool can
 * blow up a client's context window regardless of what it returns.
 */
export const MAX_RESPONSE_CHARS = 24_000;

/**
 * A tabular result in columnar form.
 *
 * Row-of-objects JSON repeats every key on every row: 740 referrers cost 23k
 * tokens as pretty-printed objects and 234 as this. Column names are stated
 * once, values are positional, and it stays valid JSON so clients can still
 * parse it.
 */
export interface TableResult {
  columns: string[];
  rows: unknown[][];
  /** Rows matched before the limit was applied. */
  total_rows: number;
  /** Present only when rows were dropped or rolled up — explains what's missing. */
  note?: string;
}

function isTableResult(value: unknown): value is TableResult {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<TableResult>;
  return Array.isArray(candidate.columns) && Array.isArray(candidate.rows);
}

export interface TableOptions<T> {
  /** Rows to keep. The tail beyond this is dropped or rolled up. */
  limit: number;
  /**
   * Column order. Defaults to the keys of the first row — pass it explicitly
   * to drop noisy fields or pin the order.
   */
  columns?: readonly (keyof T & string)[];
  /**
   * Additive columns to total into a trailing `(other)` row, so the numbers
   * still reconcile after truncation.
   *
   * Deliberately explicit: summing a rate, a position or an average produces a
   * confidently wrong number, and there is no safe way to tell those apart from
   * a column name. Columns not listed here are left null on the rollup row.
   * Omit entirely to drop the tail with only a note.
   */
  sum?: readonly (keyof T & string)[];
  /** What the rows are ranked by, for the truncation note (e.g. "sessions"). */
  sortedBy?: string;
  /** Plural noun for the rollup label (e.g. "sources" → "(other: 715 sources)"). */
  unit?: string;
  /**
   * Set when the limit was pushed into SQL, so `rows` is already capped and the
   * true total is unknown. Without this the model reads a SQL-limited result as
   * the complete set and reports "you have 25 pages" for a site with 3000.
   */
  moreAvailable?: boolean;
}

/**
 * Turn an array of row objects into a compact columnar table, capped at
 * `limit` rows, with the remainder rolled up rather than silently dropped.
 *
 * The rollup row matters more than the size saving: without it the model reads
 * a truncated list as the whole picture and its percentages are wrong. With it,
 * the totals still add up and the model can see for itself that the tail is
 * negligible.
 */
export function table<T extends object>(
  rows: readonly T[],
  options: TableOptions<T>
): TableResult {
  const { limit, sum, sortedBy, unit = 'rows', moreAvailable } = options;
  const columns: (keyof T & string)[] = options.columns
    ? [...options.columns]
    : rows.length > 0
      ? (Object.keys(rows[0] as object) as (keyof T & string)[])
      : [];

  const head = rows.slice(0, limit);
  const tail = rows.slice(limit);
  const toRow = (row: T) => columns.map((column) => row[column] ?? null);
  const out: unknown[][] = head.map(toRow);

  const rankedBy = sortedBy ? ` by ${sortedBy}` : '';

  if (tail.length === 0) {
    return {
      columns,
      rows: out,
      total_rows: rows.length,
      ...(moreAvailable
        ? {
            note: `Showing the top ${head.length} ${unit}${rankedBy}. This is a capped query — more ${unit} exist beyond the limit, so do not read ${head.length} as the total. Raise \`limit\` or narrow the range to see the rest.`,
          }
        : {}),
    };
  }

  if (!sum || sum.length === 0) {
    return {
      columns,
      rows: out,
      total_rows: rows.length,
      note: `Showing the top ${head.length} of ${rows.length} ${unit}${rankedBy}. The remaining ${tail.length} were omitted — raise \`limit\` to see them.`,
    };
  }

  const totals = new Map<string, number>();
  for (const column of sum) {
    let total = 0;
    for (const row of tail) {
      const value = row[column];
      if (typeof value === 'number' && Number.isFinite(value)) total += value;
    }
    totals.set(column, total);
  }

  const [labelColumn] = columns;
  out.push(
    columns.map((column) => {
      if (column === labelColumn) return `(other: ${tail.length} ${unit})`;
      return totals.has(column) ? totals.get(column) : null;
    })
  );

  const summed = sum.join(' + ');
  return {
    columns,
    rows: out,
    total_rows: rows.length,
    note: `Showing the top ${head.length} of ${rows.length} ${unit}${rankedBy}. The remaining ${tail.length} are aggregated into the final \`(other)\` row (${summed} summed; other columns null), so totals still reconcile. Raise \`limit\` to see them individually.`,
  };
}

/**
 * Walk a payload and shrink the largest embedded table by half.
 * Returns false when there is nothing left to shrink.
 */
function shrinkLargestTable(payload: unknown): boolean {
  let largest: TableResult | undefined;

  const visit = (node: unknown) => {
    if (node === null || typeof node !== 'object') return;
    if (isTableResult(node)) {
      if (!largest || node.rows.length > largest.rows.length) largest = node;
      return;
    }
    for (const value of Object.values(node as Record<string, unknown>)) {
      visit(value);
    }
  };
  visit(payload);

  if (!largest || largest.rows.length <= 1) return false;

  const kept = Math.max(1, Math.floor(largest.rows.length / 2));
  largest.rows = largest.rows.slice(0, kept);
  largest.note = `Truncated to ${kept} rows (of ${largest.total_rows} matched) to fit the response size limit. Narrow the date range or add a filter to see more.`;
  return true;
}

/**
 * Serialize a tool result to MCP content format.
 *
 * Compact — no indentation. Pretty-printing was 26% of the payload on a real
 * `get_top_referrers` call and buys an LLM reader nothing.
 *
 * Enforces `MAX_RESPONSE_CHARS` as a last-resort backstop: tools are expected
 * to size their own output via `table`, but a tool that returns something
 * unexpectedly large must degrade to a smaller answer rather than flood the
 * caller's context.
 */
export function toText(data: unknown): {
  content: [{ type: 'text'; text: string }];
} {
  let text = JSON.stringify(data);

  while (text.length > MAX_RESPONSE_CHARS && shrinkLargestTable(data)) {
    text = JSON.stringify(data);
  }

  if (text.length > MAX_RESPONSE_CHARS) {
    logger.warn(
      { chars: text.length },
      'MCP response exceeded size limit with no shrinkable table'
    );
    text = JSON.stringify({
      error: 'response_too_large',
      message: `This tool produced ${text.length} characters, over the ${MAX_RESPONSE_CHARS} limit, and could not be reduced automatically. Narrow the request — a shorter date range, a filter, or a more specific breakdown — and try again.`,
    });
  }

  return {
    content: [{ type: 'text' as const, text }],
  };
}

/**
 * Wrap a tool handler to catch errors and return them as MCP error content.
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>
): Promise<{ content: [{ type: 'text'; text: string }]; isError?: boolean }> {
  try {
    const result = await fn();
    return toText(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, `MCP tool error: ${message}`);
    return {
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
      isError: true,
    };
  }
}
