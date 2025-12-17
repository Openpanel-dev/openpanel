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
