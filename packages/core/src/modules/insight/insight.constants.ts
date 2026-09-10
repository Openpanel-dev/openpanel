// Moved from packages/validation/src/types.insights.ts (M11-006, ADR-008's
// module map: insight owns "C"). Plain TypeScript, no zod — isomorphic by the
// AGENTS.md rule, which constrains a constants file's imports, and this file
// has none.

// The two list procedures' page bounds. Vocabulary, not implementation: the
// dashboard pages that call `insight.list` / `insight.listAll` size their own
// requests against the same numbers the procedure enforces.
export const INSIGHT_LIST_DEFAULT_LIMIT = 50;
export const INSIGHT_LIST_MAX_LIMIT = 100;
export const INSIGHT_LIST_ALL_DEFAULT_LIMIT = 200;
export const INSIGHT_LIST_ALL_MAX_LIMIT = 500;

export type InsightMetricKey = 'sessions' | 'pageviews' | 'share';

export type InsightMetricUnit = 'count' | 'ratio';

export interface InsightMetricEntry {
  current: number;
  compare: number;
  delta: number;
  changePct: number | null;
  direction: 'up' | 'down' | 'flat';
  unit: InsightMetricUnit;
}

export interface InsightDimension {
  key: string;
  value: string;
  displayName?: string;
}

export interface InsightExtra {
  [key: string]: unknown;
  currentShare?: number;
  compareShare?: number;
  shareShiftPp?: number;
  isNew?: boolean;
  isGone?: boolean;
}

/**
 * Shared payload shape for insights cards. This is embedded in DB rows and
 * shipped to the frontend, so it must remain backwards compatible.
 */
export interface InsightPayload {
  kind?: 'insight_v1';
  dimensions: InsightDimension[];
  primaryMetric: InsightMetricKey;
  metrics: Partial<Record<InsightMetricKey, InsightMetricEntry>>;

  /**
   * Module-specific extra data.
   */
  extra?: Record<string, unknown>;
}
