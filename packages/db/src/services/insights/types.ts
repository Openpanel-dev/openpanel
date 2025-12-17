import type {
  InsightDimension,
  InsightMetricEntry,
  InsightMetricKey,
  InsightPayload,
} from '@openpanel/validation';

export type Cadence = 'daily';

export type WindowKind = 'yesterday' | 'rolling_7d' | 'rolling_30d';

export interface WindowRange {
  kind: WindowKind;
  start: Date; // inclusive
  end: Date; // inclusive (or exclusive, but be consistent)
  baselineStart: Date;
  baselineEnd: Date;
  label: string; // e.g. "Yesterday" / "Last 7 days"
}

export interface ComputeContext {
  projectId: string;
  window: WindowRange;
  db: any; // your DB client
  now: Date;
  logger: Pick<Console, 'info' | 'warn' | 'error'>;
  /**
   * Cached clix function that automatically caches query results based on query hash.
   * This eliminates duplicate queries within the same module+window context.
   * Use this instead of importing clix directly to benefit from automatic caching.
   */
  clix: ReturnType<typeof import('./cached-clix').createCachedClix>;
}

export interface ComputeResult {
  ok: boolean;
  dimensionKey: string; // e.g. "referrer:instagram" / "page:/pricing"
  currentValue?: number;
  compareValue?: number;
  changePct?: number; // -0.15 = -15%
  direction?: 'up' | 'down' | 'flat';
  extra?: Record<string, unknown>; // share delta pp, rank, sparkline, etc.
}

// Types imported from @openpanel/validation:
// - InsightMetricKey
// - InsightMetricEntry
// - InsightDimension
// - InsightPayload

/**
 * Render should be deterministic and safe to call multiple times.
 * Returns the shape that matches ProjectInsight create input.
 * The payload contains all metric data and display metadata.
 */
export interface RenderedCard {
  title: string;
  summary?: string;
  displayName: string;
  payload: InsightPayload; // Contains dimensions, primaryMetric, metrics, extra
}

/** Optional per-module thresholds (the engine can still apply global defaults) */
export interface ModuleThresholds {
  minTotal?: number; // min current+baseline
  minAbsDelta?: number; // min abs(current-compare)
  minPct?: number; // min abs(changePct)
  maxDims?: number; // cap enumerateDimensions
}

export interface InsightModule {
  key: string;
  cadence: Cadence[];
  /** Optional per-module override; engine applies a default if omitted. */
  windows?: WindowKind[];
  thresholds?: ModuleThresholds;
  enumerateDimensions?(ctx: ComputeContext): Promise<string[]>;
  /** Preferred path: batch compute many dimensions in one go. */
  computeMany(
    ctx: ComputeContext,
    dimensionKeys: string[],
  ): Promise<ComputeResult[]>;
  /** Must not do DB reads; just format output. */
  render(result: ComputeResult, ctx: ComputeContext): RenderedCard;
  /** Score decides what to show (top-N). */
  score?(result: ComputeResult, ctx: ComputeContext): number;
  /** Optional: compute "drivers" for AI explain step */
  drivers?(
    result: ComputeResult,
    ctx: ComputeContext,
  ): Promise<Record<string, unknown>>;
}

/** Insight row shape returned from persistence (minimal fields engine needs). */
export interface PersistedInsight {
  id: string;
  projectId: string;
  moduleKey: string;
  dimensionKey: string;
  windowKind: WindowKind;
  state: 'active' | 'suppressed' | 'closed';
  version: number;
  impactScore: number;
  lastSeenAt: Date;
  lastUpdatedAt: Date;
  direction?: string | null;
  severityBand?: string | null;
}

/** Material change decision used for events/notifications. */
export type MaterialReason =
  | 'created'
  | 'direction_flip'
  | 'severity_change'
  | 'cross_deadband'
  | 'reopened'
  | 'none';

export interface MaterialDecision {
  material: boolean;
  reason: MaterialReason;
  newSeverityBand?: 'low' | 'moderate' | 'severe' | null;
}

/**
 * Persistence interface: implement with Postgres.
 * Keep engine independent of query builder choice.
 */
export interface InsightStore {
  listProjectIdsForCadence(cadence: Cadence): Promise<string[]>;
  /** Used by the engine/worker to decide if a window has enough baseline history. */
  getProjectCreatedAt(projectId: string): Promise<Date | null>;
  getActiveInsightByIdentity(args: {
    projectId: string;
    moduleKey: string;
    dimensionKey: string;
    windowKind: WindowKind;
  }): Promise<PersistedInsight | null>;
  upsertInsight(args: {
    projectId: string;
    moduleKey: string;
    dimensionKey: string;
    window: WindowRange;
    card: RenderedCard;
    metrics: {
      direction?: 'up' | 'down' | 'flat';
      impactScore: number;
      severityBand?: string | null;
    };
    now: Date;
    decision: MaterialDecision;
    prev: PersistedInsight | null;
  }): Promise<PersistedInsight>;
  insertEvent(args: {
    projectId: string;
    insightId: string;
    moduleKey: string;
    dimensionKey: string;
    windowKind: WindowKind;
    eventKind:
      | 'created'
      | 'updated'
      | 'severity_up'
      | 'severity_down'
      | 'direction_flip'
      | 'closed'
      | 'reopened'
      | 'suppressed'
      | 'unsuppressed';
    changeFrom?: Record<string, unknown> | null;
    changeTo?: Record<string, unknown> | null;
    now: Date;
  }): Promise<void>;
  /** Mark insights as not seen this run if you prefer lifecycle via closeMissing() */
  closeMissingActiveInsights(args: {
    projectId: string;
    moduleKey: string;
    windowKind: WindowKind;
    seenDimensionKeys: string[];
    now: Date;
    staleDays: number; // close if not seen for X days
  }): Promise<number>; // count closed
  /** Enforce top-N display by suppressing below-threshold insights. */
  applySuppression(args: {
    projectId: string;
    moduleKey: string;
    windowKind: WindowKind;
    keepTopN: number;
    now: Date;
  }): Promise<{ suppressed: number; unsuppressed: number }>;
}
