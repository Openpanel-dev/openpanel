// Moved from packages/db/src/services/insights* + referrer-spikes.service.ts
// (M5-001, the AI engine module). ADR-007: "Moves to core: src/services/**
// (33 services + insights/)".
//
// Plain exported functions, not only methods on `createInsightService`'s
// container — the same shape as modules/auth/auth.service.ts, because V1's
// worker (apps/worker, no core Ctx today) and V1's trpc router both need a
// direct call, not one that requires building a Ctx first. `createInsightService`
// is the `ctx.services.insight` binding for code that already has a Ctx.
//
// M10-009: every exported function takes `ServiceDeps` and reaches Postgres
// as `deps.db` and ClickHouse as `deps.ch`; the `loadDb()`/`loadCh()` lazy
// loaders are gone, so the requestId minted at the edge reaches the query
// (ADR-018, docs/TECH_DEBT.md §4). The remaining `load*` functions are
// intra-package lazy imports (engine, store, detection modules) kept lazy for
// their own import cost, not for a client's.
//
// M12-007: the engine and its five detection modules run on the `sql` tag
// (ADR-013); `createEngine` therefore takes the scope's deps rather than a bare
// ClickHouse client, so the requestId reaches every module statement.
// `legacy-scan.ts` is the last clix holdout in this module (M12-008).

import { getRedisCache } from '@openpanel/redis';
import {
  ENRICH_VERSION,
  enrichInsights,
  type InsightToEnrich,
} from '../../clients/ai/enrich';
import {
  type ExplainInsightInput,
  generateInsightExplanation,
  type InsightExplanation,
} from '../../clients/ai/explain';
import { generateWeeklyNarrative } from '../../clients/ai/narrative';
import { sendEmail } from '../../clients/email';
import type { Logger } from '../../logger';
import type { ServiceDeps } from '../../services';
import type { EngineConfig } from './src/engine';
import type { Insight as LegacyInsight } from './src/legacy-scan';
import type {
  GetReferrerSpikesInput,
  ReferrerSpikeCluster,
} from './src/referrer-spikes';

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPLAIN_CACHE_TTL_SEC = 24 * 60 * 60;

// Tier-1 enrichment batch size, kept modest so the prompt stays small and the
// id-mapping reliable.
const ENRICH_BATCH_SIZE = 25;

// Postgres batch-delete chunk — bounds the first (large) purge to never hold a
// single long-lived transaction/lock.
const CLEANUP_BATCH_SIZE = 5000;
const CLEANUP_MAX_BATCHES = 2000; // runaway backstop: 5000 * 2000 = 10M rows
const DEFAULT_INSIGHTS_RETENTION_DAYS = 90;

// Weekly digest: quiet threshold + how many email-worthy insights to surface.
const WEEKLY_DIGEST_MIN_EVENTS = 100;
const WEEKLY_DIGEST_MAX_INSIGHTS = 5;

const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  keepTopNPerModuleWindow: 20,
  closeStaleAfterDays: 7,
  dimensionBatchSize: 50,
  globalThresholds: {
    minTotal: 200,
    minAbsDelta: 80,
    minPct: 0.15,
  },
};

function loadEngine() {
  return import('./src/engine');
}

function loadStore(deps: ServiceDeps) {
  return import('./src/store').then((m) => m.createInsightStore(deps));
}

function loadDetectionModules() {
  return import('./src/modules');
}

function loadReferrerSpikesQuery() {
  return import('./src/referrer-spikes').then((m) => m.getReferrerSpikes);
}

function loadLegacyDetector() {
  return import('./src/legacy-scan').then((m) => m.createLegacyInsightsScanner);
}

export interface DailyInsightCandidate {
  projectId: string;
  date: string;
}

export interface WeeklyDigestResult {
  projects: number;
  sent: number;
}

export interface WeeklyDigestPreview {
  sent: boolean;
  to?: string;
  skipped?: string;
  data?: unknown;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) {
    return 0;
  }
  return Math.max(0, Math.min(1, n));
}

/** The `insightsDaily` cron fan-out: eligible project ids, paired with `date`. */
export async function listDailyInsightCandidates(
  deps: ServiceDeps,
  date: string
): Promise<DailyInsightCandidate[]> {
  const insightStore = await loadStore(deps);
  const projectIds = await insightStore.listProjectIdsForCadence('daily');
  return projectIds.map((projectId) => ({ projectId, date }));
}

/**
 * Tier-1 AI enrichment for one project's active insights: scores anything
 * new, materially-changed, or enriched under an older prompt version.
 * Failures are logged and skipped — a bad batch must never fail the insights
 * job itself.
 */
async function enrichProjectInsights(
  deps: ServiceDeps,
  projectId: string,
  logger: Logger
): Promise<void> {
  const db = deps.db;

  const stale = await db.projectInsight.findMany({
    where: {
      projectId,
      state: 'active',
      OR: [
        { enrichedAt: null },
        { enrichVersion: null },
        { enrichVersion: { lt: ENRICH_VERSION } },
      ],
    },
    select: {
      id: true,
      moduleKey: true,
      dimensionKey: true,
      windowKind: true,
      title: true,
      summary: true,
      displayName: true,
      direction: true,
      impactScore: true,
      severityBand: true,
      payload: true,
    },
  });

  if (stale.length === 0) {
    return;
  }

  let enriched = 0;
  for (let i = 0; i < stale.length; i += ENRICH_BATCH_SIZE) {
    const batch = stale.slice(i, i + ENRICH_BATCH_SIZE);
    const input: InsightToEnrich[] = batch.map((r) => ({
      id: r.id,
      moduleKey: r.moduleKey,
      dimensionKey: r.dimensionKey,
      windowKind: r.windowKind,
      title: r.title,
      summary: r.summary,
      displayName: r.displayName,
      direction: r.direction,
      impactScore: r.impactScore,
      severityBand: r.severityBand,
      payload: r.payload,
    }));

    let results: Awaited<ReturnType<typeof enrichInsights>>;
    try {
      results = await enrichInsights(input);
    } catch (err) {
      logger.error(
        { err, projectId, batchSize: batch.length },
        'insight enrichment call failed; skipping batch'
      );
      continue;
    }

    const byId = new Map(results.map((r) => [r.id, r]));
    for (const row of batch) {
      const e = byId.get(row.id);
      if (!e) {
        continue;
      }
      await db.projectInsight.update({
        where: { id: row.id },
        data: {
          relevanceScore: clamp01(e.relevanceScore),
          aiSummary: e.summary,
          aiCategory: e.category,
          emailWorthy: e.emailWorthy,
          referenceWorthy: e.referenceWorthy,
          enrichedAt: new Date(),
          enrichVersion: ENRICH_VERSION,
        },
      });
      enriched++;
    }
  }

  logger.info(
    { projectId, candidates: stale.length, enriched },
    'insight enrichment complete'
  );
}

/** The `insightsProject` job body: engine run + tier-1 AI enrichment. */
export async function runProjectInsights(
  deps: ServiceDeps,
  args: {
    projectId: string;
    date: string;
    logger: Logger;
  }
): Promise<void> {
  const { projectId, date, logger } = args;
  const [{ createEngine }, insightStore, detectionModules] = await Promise.all([
    loadEngine(),
    loadStore(deps),
    loadDetectionModules(),
  ]);

  const engine = createEngine({
    store: insightStore,
    modules: [
      detectionModules.referrersModule,
      detectionModules.entryPagesModule,
      detectionModules.pageTrendsModule,
      detectionModules.geoModule,
      detectionModules.devicesModule,
    ],
    deps,
    config: DEFAULT_ENGINE_CONFIG,
  });

  const projectCreatedAt = await insightStore.getProjectCreatedAt(projectId);

  await engine.runProject({
    projectId,
    cadence: 'daily',
    now: new Date(date),
    projectCreatedAt,
  });

  // Isolated so a provider outage or rate-limit never fails the insights
  // computation itself.
  try {
    await enrichProjectInsights(deps, projectId, logger);
  } catch (err) {
    logger.error({ err, projectId }, 'insight enrichment failed');
  }
}

async function deleteInBatches(
  runBatch: () => Promise<number>
): Promise<number> {
  let total = 0;
  for (let i = 0; i < CLEANUP_MAX_BATCHES; i++) {
    const deleted = await runBatch();
    total += deleted;
    if (deleted < CLEANUP_BATCH_SIZE) {
      break;
    }
  }
  return total;
}

/**
 * Keeps the insights tables bounded (they otherwise grow forever — see the
 * original packages/db/src/services/insights.service.ts header for the
 * retention rules). The `insightCleanup` cron job body.
 */
export async function cleanupStaleInsights(
  deps: ServiceDeps,
  logger: Logger
): Promise<{ insights: number; events: number }> {
  const db = deps.db;
  const retentionDays = Number.parseInt(
    process.env.INSIGHTS_RETENTION_DAYS ||
      String(DEFAULT_INSIGHTS_RETENTION_DAYS),
    10
  );
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const suppressed = await deleteInBatches(
    () => db.$executeRaw`
      DELETE FROM "project_insights"
      WHERE "id" IN (
        SELECT "id" FROM "project_insights"
        WHERE "state" = 'suppressed'
        LIMIT ${CLEANUP_BATCH_SIZE}
      )`
  );

  const closed = await deleteInBatches(
    () => db.$executeRaw`
      DELETE FROM "project_insights"
      WHERE "id" IN (
        SELECT "id" FROM "project_insights"
        WHERE "state" = 'closed'
          AND "lastSeenAt" < ${cutoff}
        LIMIT ${CLEANUP_BATCH_SIZE}
      )`
  );
  const insights = suppressed + closed;

  const events = await deleteInBatches(
    () => db.$executeRaw`
      DELETE FROM "insight_events"
      WHERE "id" IN (
        SELECT "id" FROM "insight_events"
        WHERE "createdAt" < ${cutoff}
        LIMIT ${CLEANUP_BATCH_SIZE}
      )`
  );

  logger.info({ retentionDays, insights, events }, 'insight cleanup complete');
  return { insights, events };
}

function pctDelta(
  current: number,
  previous: number
): { delta?: string; direction: 'up' | 'down' | 'flat' } {
  if (previous <= 0) {
    return { direction: 'flat' };
  }
  const pct = ((current - previous) / previous) * 100;
  const direction = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
  const sign = pct >= 0 ? '+' : '';
  return { delta: `${sign}${pct.toFixed(0)}%`, direction };
}

function ppDelta(
  current: number,
  previous: number
): { delta?: string; direction: 'up' | 'down' | 'flat' } {
  const diff = current - previous;
  const direction = diff > 0.5 ? 'up' : diff < -0.5 ? 'down' : 'flat';
  const sign = diff >= 0 ? '+' : '';
  return { delta: `${sign}${diff.toFixed(0)}pp`, direction };
}

function formatCount(n: number): string {
  return Math.round(n).toLocaleString();
}

function formatRange(startMs: number, endMs: number): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const start = new Date(startMs).toLocaleDateString('en-US', opts);
  const end = new Date(endMs).toLocaleDateString('en-US', {
    ...opts,
    year: 'numeric',
  });
  return `${start} – ${end}`;
}

interface DigestProjectRow {
  id: string;
  name: string;
  organizationId: string;
}

/** Assembles one project's digest payload (no sending). */
async function buildDigestData(
  deps: ServiceDeps,
  project: DigestProjectRow,
  opts: { force?: boolean } = {}
): Promise<{ skipped?: string; data?: Record<string, unknown> }> {
  const now = Date.now();
  const curStart = now - 7 * DAY_MS;
  const prevStart = now - 14 * DAY_MS;
  const iso = (ms: number) => new Date(ms).toISOString();

  const db = deps.db;
  const { getAnalyticsOverviewCore } = await import('../../v1-compat');

  const [cur, prev] = await Promise.all([
    getAnalyticsOverviewCore({
      projectId: project.id,
      startDate: iso(curStart),
      endDate: iso(now),
      interval: 'day',
    }),
    getAnalyticsOverviewCore({
      projectId: project.id,
      startDate: iso(prevStart),
      endDate: iso(curStart),
      interval: 'day',
    }),
  ]);

  const c = cur.summary;
  const p = prev.summary;

  if (!opts.force && c.unique_visitors === 0) {
    return { skipped: 'no visitors in the last 7 days' };
  }

  const stats = [
    {
      label: 'visitors',
      value: formatCount(c.unique_visitors),
      ...pctDelta(c.unique_visitors, p.unique_visitors),
    },
    {
      label: 'sessions',
      value: formatCount(c.total_sessions),
      ...pctDelta(c.total_sessions, p.total_sessions),
    },
    {
      label: 'pageviews',
      value: formatCount(c.total_screen_views),
      ...pctDelta(c.total_screen_views, p.total_screen_views),
    },
    {
      label: 'bounce rate',
      value: `${Math.round(c.bounce_rate)}%`,
      ...ppDelta(c.bounce_rate, p.bounce_rate),
    },
  ];

  const insightRows = await db.projectInsight.findMany({
    where: {
      projectId: project.id,
      state: 'active',
      emailWorthy: true,
      windowKind: { in: ['rolling_7d'] },
    },
    orderBy: [
      { relevanceScore: { sort: 'desc', nulls: 'last' } },
      { impactScore: 'desc' },
    ],
    take: WEEKLY_DIGEST_MAX_INSIGHTS,
    select: { title: true, aiSummary: true, summary: true },
  });

  const insights = insightRows.map((i) => ({
    title: i.aiSummary ?? i.title,
    summary: i.summary ?? undefined,
  }));

  const dateRange = formatRange(curStart, now);

  let narrative = '';
  try {
    narrative = await generateWeeklyNarrative({
      projectName: project.name,
      dateRange,
      stats: [
        {
          label: 'visitors',
          current: c.unique_visitors,
          previous: p.unique_visitors,
        },
        {
          label: 'sessions',
          current: c.total_sessions,
          previous: p.total_sessions,
        },
        {
          label: 'pageviews',
          current: c.total_screen_views,
          previous: p.total_screen_views,
        },
        {
          label: 'bounce rate',
          current: c.bounce_rate,
          previous: p.bounce_rate,
          unit: '%',
        },
      ],
      insights,
    });
  } catch {
    // Narrative is best-effort — the digest still sends without it.
  }

  const dashboardUrl = `${process.env.DASHBOARD_URL ?? 'https://dashboard.openpanel.dev'}/${project.organizationId}/${project.id}`;

  return {
    data: {
      projectName: project.name,
      dashboardUrl,
      dateRange,
      narrative: narrative || undefined,
      stats,
      insights,
    },
  };
}

async function recipientsForOrg(
  deps: ServiceDeps,
  organizationId: string
): Promise<string[]> {
  const db = deps.db;
  const members = await db.member.findMany({
    where: { organizationId },
    select: { email: true },
  });
  return [...new Set(members.map((m) => m.email).filter(Boolean))];
}

/**
 * Per active project: week-over-week stats + the AI's email-worthy insights +
 * a generated narrative, mailed to org members. The `weeklyDigest` cron job
 * body.
 */
export async function sendWeeklyDigests(
  deps: ServiceDeps,
  logger: Logger
): Promise<WeeklyDigestResult> {
  const db = deps.db;

  // Prefilter on the raw status column (computed fields can't be used in
  // `where`), then refine with the canonical subscription state below.
  const projects = await db.project.findMany({
    where: {
      deleteAt: null,
      eventsCount: { gt: WEEKLY_DIGEST_MIN_EVENTS },
      organization: { subscriptionStatus: { in: ['active', 'trialing'] } },
    },
    select: {
      id: true,
      name: true,
      organizationId: true,
      organization: { select: { subscriptionState: true } },
    },
  });

  let sent = 0;
  for (const project of projects) {
    try {
      const state = project.organization.subscriptionState;
      if (state !== 'active' && state !== 'trialing') {
        continue;
      }

      const { skipped, data } = await buildDigestData(deps, project);
      if (skipped || !data) {
        continue;
      }
      const emails = await recipientsForOrg(deps, project.organizationId);
      if (emails.length === 0) {
        continue;
      }
      for (const to of emails) {
        await sendEmail('weekly-digest', { to, data: data as never });
      }
      sent++;
    } catch (err) {
      logger.error({ err, projectId: project.id }, 'weekly digest failed');
    }
  }

  logger.info({ projects: projects.length, sent }, 'weekly digest complete');
  return { projects: projects.length, sent };
}

/**
 * Debug/testing helper for a SINGLE project, bypassing eligibility.
 *   - opts.to    → send only to that address (safe for testing)
 *   - no opts.to → assemble and return the payload without sending (preview)
 *   - opts.force → build even if the project had 0 visitors this week
 */
export async function previewWeeklyDigest(
  deps: ServiceDeps,
  projectId: string,
  opts: { to?: string; force?: boolean } = {}
): Promise<WeeklyDigestPreview> {
  const db = deps.db;
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, organizationId: true },
  });
  if (!project) {
    return { sent: false, skipped: 'project not found' };
  }

  const { skipped, data } = await buildDigestData(deps, project, {
    force: opts.force,
  });
  if (skipped || !data) {
    return { sent: false, skipped, data };
  }

  if (opts.to) {
    await sendEmail('weekly-digest', { to: opts.to, data: data as never });
    return { sent: true, to: opts.to, data };
  }

  return { sent: false, data };
}

export async function listInsights(
  deps: ServiceDeps,
  args: { projectId: string; limit: number }
) {
  const db = deps.db;
  return db.projectInsight.findMany({
    where: { projectId: args.projectId, state: 'active' },
    orderBy: [
      { relevanceScore: { sort: 'desc', nulls: 'last' } },
      { impactScore: 'desc' },
    ],
    take: args.limit,
  });
}

export async function listAllInsights(
  deps: ServiceDeps,
  args: {
    projectId: string;
    limit: number;
  }
) {
  const db = deps.db;
  return db.projectInsight.findMany({
    where: { projectId: args.projectId, state: 'active' },
    orderBy: [
      { relevanceScore: { sort: 'desc', nulls: 'last' } },
      { impactScore: 'desc' },
    ],
    take: args.limit,
  });
}

/**
 * Explains one insight, cached per insight version (`cacheKey` already
 * carries the insight id + `lastUpdatedAt`) so repeat clicks don't re-bill
 * the LLM.
 */
export async function explainInsight(
  input: ExplainInsightInput,
  cacheKey: string
): Promise<InsightExplanation | null> {
  const cached = await getRedisCache().get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as InsightExplanation;
  }

  const explanation = await generateInsightExplanation(input);

  // Only cache a successful explanation — a null is a transient LLM failure
  // and should be retried on the next click.
  if (explanation) {
    await getRedisCache().setex(
      cacheKey,
      EXPLAIN_CACHE_TTL_SEC,
      JSON.stringify(explanation)
    );
  }

  return explanation;
}

export async function getReferrerSpikes(
  deps: ServiceDeps,
  input: GetReferrerSpikesInput
): Promise<ReferrerSpikeCluster[]> {
  const query = await loadReferrerSpikesQuery();
  return query(deps, input);
}

/** Pre-engine detector, kept for parity with V1 — no live callers today. */
export async function scanLegacyInsights(
  deps: ServiceDeps,
  projectId: string
): Promise<LegacyInsight[]> {
  const createLegacyInsightsScanner = await loadLegacyDetector();
  return createLegacyInsightsScanner(deps).generateInsights(projectId);
}

// Re-exported at each type's own import site (noExportedImports): a type
// that is also used locally still gets `export type {} from '<module>'`
// rather than a second `import`-then-`export` pair gathered here.
export type {
  ExplainInsightInput,
  InsightExplanation,
} from '../../clients/ai/explain';
export type {
  GetReferrerSpikesInput,
  ReferrerSpikeCluster,
} from './src/referrer-spikes';

export interface InsightService {
  listDailyInsightCandidates(date: string): Promise<DailyInsightCandidate[]>;
  runProjectInsights(args: { projectId: string; date: string }): Promise<void>;
  cleanupStaleInsights(): Promise<{ insights: number; events: number }>;
  sendWeeklyDigests(): Promise<WeeklyDigestResult>;
  previewWeeklyDigest(
    projectId: string,
    opts?: { to?: string; force?: boolean }
  ): Promise<WeeklyDigestPreview>;
  listInsights(args: {
    projectId: string;
    limit: number;
  }): ReturnType<typeof listInsights>;
  listAllInsights(args: {
    projectId: string;
    limit: number;
  }): ReturnType<typeof listAllInsights>;
  explainInsight(
    input: ExplainInsightInput,
    cacheKey: string
  ): Promise<InsightExplanation | null>;
  getReferrerSpikes(
    input: GetReferrerSpikesInput
  ): Promise<ReferrerSpikeCluster[]>;
  scanLegacyInsights(projectId: string): Promise<LegacyInsight[]>;
}

/** `ctx.services.insight` — a thin binding of the functions above to a Ctx's logger. */
export function createInsightService(deps: ServiceDeps): InsightService {
  const logger = deps.logger.child({ module: 'insight' });

  return {
    listDailyInsightCandidates: (date) =>
      listDailyInsightCandidates(deps, date),
    runProjectInsights: (args) => runProjectInsights(deps, { ...args, logger }),
    cleanupStaleInsights: () => cleanupStaleInsights(deps, logger),
    sendWeeklyDigests: () => sendWeeklyDigests(deps, logger),
    previewWeeklyDigest: (projectId, opts) =>
      previewWeeklyDigest(deps, projectId, opts),
    listInsights: (args) => listInsights(deps, args),
    listAllInsights: (args) => listAllInsights(deps, args),
    explainInsight,
    getReferrerSpikes: (input) => getReferrerSpikes(deps, input),
    scanLegacyInsights: (projectId) => scanLegacyInsights(deps, projectId),
  };
}
