/**
 * Frontend-side TypeScript types for the chat tool outputs we render
 * with custom UIs. These mirror what the matching backend tool returns
 * — see `apps/api/src/chat/tools/*.ts`. The renderers narrow `unknown`
 * via the type guards below before reading any field.
 *
 * If the backend changes a tool's return shape, the matching renderer
 * will fall back to a "no data" card rather than crashing — that's why
 * we narrow with predicates rather than `as any`.
 */

// ────────────────────────────────────────────────────────────────────
// Metrics (get_analytics_overview, get_profile_metrics)
// ────────────────────────────────────────────────────────────────────

export type MetricsLike = Record<string, unknown>;

export function isMetricsLike(value: unknown): value is MetricsLike {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ────────────────────────────────────────────────────────────────────
// Profile full (get_profile_full)
// ────────────────────────────────────────────────────────────────────

export type ProfileMetrics = {
  sessions?: number;
  totalEvents?: number;
  screenViews?: number;
  avgSessionDurationMin?: number;
  bounceRate?: number;
  revenue?: number;
};

export type ProfileFullSuccess = {
  profile?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  };
  metrics?: ProfileMetrics | null;
  recent_sessions?: unknown[];
  recent_events?: unknown[];
  dashboard_url?: string;
};

export type ProfileFullError = {
  error: string;
  profileId?: string;
};

export type ProfileFullOutput = ProfileFullSuccess | ProfileFullError;

export function isProfileFullError(
  value: ProfileFullOutput,
): value is ProfileFullError {
  return 'error' in value && typeof value.error === 'string';
}

export function asProfileFullOutput(value: unknown): ProfileFullOutput | null {
  if (!value || typeof value !== 'object') return null;
  return value as ProfileFullOutput;
}

// ────────────────────────────────────────────────────────────────────
// Report (get_report_data, generate_report, preview_report_with_changes)
// ────────────────────────────────────────────────────────────────────

export type ReportOutput = {
  data?: unknown;
  report?: {
    id?: string;
    chartType?: string;
    [key: string]: unknown;
  };
  name?: string;
  dashboard_url?: string;
  error?: string;
};

export function asReportOutput(value: unknown): ReportOutput | null {
  if (!value || typeof value !== 'object') return null;
  return value as ReportOutput;
}

// ────────────────────────────────────────────────────────────────────
// Tables (top_pages, top_referrers, country_breakdown, etc.)
// ────────────────────────────────────────────────────────────────────

export type TableRow = Record<string, unknown>;

export type TableNormalized = {
  rows: TableRow[];
  total: number | undefined;
  truncated: boolean;
};

/**
 * Several tools return either an array directly or wrap it in `{ rows }`,
 * `{ data }`, `{ opportunities }`, or `{ properties }`. This is the one
 * place where we resolve that — every renderer downstream gets a clean
 * `TableRow[]`.
 *
 * `properties` covers `list_event_properties` / `list_properties_for_event`,
 * which return a flat `string[]` of property keys after the server rolled
 * up dotted sub-keys. We lift each into `{ property_key }` so the generic
 * table renderer can pick it up as the label column.
 */
export function normalizeTableOutput(value: unknown): TableNormalized {
  if (Array.isArray(value)) {
    return {
      rows: value as TableRow[],
      total: undefined,
      truncated: false,
    };
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const total = typeof o.total === 'number' ? o.total : undefined;
    const truncated = o._truncated === true;
    if (Array.isArray(o.rows)) {
      return { rows: o.rows as TableRow[], total, truncated };
    }
    if (Array.isArray(o.data)) {
      return { rows: o.data as TableRow[], total, truncated };
    }
    if (Array.isArray(o.opportunities)) {
      return { rows: o.opportunities as TableRow[], total, truncated };
    }
    if (Array.isArray(o.properties)) {
      const rows: TableRow[] = (o.properties as unknown[]).map((p) =>
        typeof p === 'string' ? { property_key: p } : (p as TableRow),
      );
      return { rows, total, truncated };
    }
  }
  return { rows: [], total: undefined, truncated: false };
}
