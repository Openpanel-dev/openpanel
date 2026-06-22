import { generateInsightExplanation } from '@openpanel/ai';
import {
  db,
  getSegmentDailySeriesCore,
  getTrafficBreakdownCore,
} from '@openpanel/db';
import { getRedisCache } from '@openpanel/redis';
import type { InsightPayload } from '@openpanel/validation';
import { z } from 'zod';
import { getProjectAccess } from '../access';
import { TRPCForbiddenError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const DAY_MS = 24 * 60 * 60 * 1000;
// The explanation is a paid LLM call. Cache it keyed by the insight's
// lastUpdatedAt so repeat clicks within the window are free, while any recompute
// that changes the insight produces a new key and a fresh explanation.
const EXPLAIN_CACHE_TTL_SEC = 24 * 60 * 60;
const EXPLAIN_COLUMNS = [
  'referrer_name',
  'country',
  'device',
  'utm_source',
] as const;

export const insightRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        limit: z.number().min(1).max(100).optional().default(50),
      }),
    )
    .query(async ({ input: { projectId, limit }, ctx }) => {
      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId,
      });

      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      // Fetch more insights than needed to account for deduplication.
      // AI relevanceScore leads (un-enriched insights sort last via nulls:last),
      // with the statistical impactScore as the tiebreaker / fallback.
      const allInsights = await db.projectInsight.findMany({
        where: {
          projectId,
          state: 'active',
        },
        orderBy: [
          { relevanceScore: { sort: 'desc', nulls: 'last' } },
          { impactScore: 'desc' },
        ],
        take: limit * 3, // Fetch 3x to account for deduplication
      });

      // WindowKind priority: yesterday (1) > rolling_7d (2) > rolling_30d (3)
      const windowKindPriority: Record<string, number> = {
        yesterday: 1,
        rolling_7d: 2,
        rolling_30d: 3,
      };

      // Group by moduleKey + dimensionKey, keep only highest priority windowKind
      const deduplicated = new Map<string, (typeof allInsights)[0]>();
      for (const insight of allInsights) {
        const key = `${insight.moduleKey}:${insight.dimensionKey}`;
        const existing = deduplicated.get(key);
        const currentPriority = windowKindPriority[insight.windowKind] ?? 999;
        const existingPriority = existing
          ? (windowKindPriority[existing.windowKind] ?? 999)
          : 999;

        // Keep if no existing, or if current has higher priority (lower number)
        if (!existing || currentPriority < existingPriority) {
          deduplicated.set(key, insight);
        }
      }

      // Convert back to array, sort by relevanceScore (impactScore fallback),
      // and limit
      const insights = Array.from(deduplicated.values())
        .sort(
          (a, b) =>
            (b.relevanceScore ?? -1) - (a.relevanceScore ?? -1) ||
            (b.impactScore ?? 0) - (a.impactScore ?? 0),
        )
        .slice(0, limit)
        .map(({ impactScore, ...rest }) => rest); // Remove impactScore from response

      return insights;
    }),

  listAll: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        limit: z.number().min(1).max(500).optional().default(200),
      }),
    )
    .query(async ({ input: { projectId, limit }, ctx }) => {
      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId,
      });

      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      const insights = await db.projectInsight.findMany({
        where: {
          projectId,
          state: 'active',
        },
        orderBy: [
          { relevanceScore: { sort: 'desc', nulls: 'last' } },
          { impactScore: 'desc' },
        ],
        take: limit,
      });

      return insights;
    }),

  // Phase 5: the "why". Decompose the insight's change across referrer/country/
  // device/utm (current vs baseline window), pull nearby references, and have
  // the AI explain which sub-segment drove it. On-demand (a button); the result
  // is cached per insight version so repeat clicks don't re-bill the LLM.
  explain: protectedProcedure
    .input(z.object({ insightId: z.string() }))
    .mutation(async ({ input: { insightId }, ctx }) => {
      const insight = await db.projectInsight.findUniqueOrThrow({
        where: { id: insightId },
        select: {
          projectId: true,
          title: true,
          aiSummary: true,
          summary: true,
          dimensionKey: true,
          windowKind: true,
          windowStart: true,
          windowEnd: true,
          payload: true,
          lastUpdatedAt: true,
        },
      });

      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: insight.projectId,
      });

      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      // Serve a cached explanation if the insight hasn't changed since we
      // computed it. Skips both the ClickHouse queries and the LLM call.
      const cacheKey = `insight-explain:${insightId}:${insight.lastUpdatedAt.getTime()}`;
      const cached = await getRedisCache().get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as Awaited<
          ReturnType<typeof generateInsightExplanation>
        >;
      }

      // Current window from the insight; baseline = same span immediately before.
      const end = insight.windowEnd ?? new Date();
      const start =
        insight.windowStart ?? new Date(end.getTime() - 7 * DAY_MS);
      const spanMs = Math.max(end.getTime() - start.getTime(), DAY_MS);
      const baseEnd = new Date(start.getTime());
      const baseStart = new Date(start.getTime() - spanMs);
      const iso = (d: Date) => d.toISOString();

      const breakdowns = await Promise.all(
        EXPLAIN_COLUMNS.map(async (column) => {
          const [cur, base] = await Promise.all([
            getTrafficBreakdownCore({
              projectId: insight.projectId,
              column,
              startDate: iso(start),
              endDate: iso(end),
            }),
            getTrafficBreakdownCore({
              projectId: insight.projectId,
              column,
              startDate: iso(baseStart),
              endDate: iso(baseEnd),
            }),
          ]);
          const compact = (rows: typeof cur) =>
            rows.slice(0, 8).map((r) => ({
              name: r.name ?? null,
              sessions: Number(r.sessions ?? 0),
            }));
          return { column, current: compact(cur), baseline: compact(base) };
        }),
      );

      // Daily series for the insight's own segment, so the model can read the
      // shape of the change (a one-off spike vs sustained growth) instead of
      // only the current-vs-baseline totals. Best-effort: skip on page/entry
      // insights (events-table metrics) or anything we can't resolve.
      const payload = insight.payload as InsightPayload | null;
      const segment = payload?.dimensions?.[0];
      const primaryMetric = payload?.primaryMetric ?? 'sessions';
      let dailySeries:
        | {
            metric: string;
            current: { date: string; sessions: number }[];
            baseline: { date: string; sessions: number }[];
          }
        | undefined;

      if (segment?.key && segment.value) {
        const [curSeries, baseSeries] = await Promise.all([
          getSegmentDailySeriesCore({
            projectId: insight.projectId,
            column: segment.key,
            value: segment.value,
            startDate: iso(start),
            endDate: iso(end),
          }),
          getSegmentDailySeriesCore({
            projectId: insight.projectId,
            column: segment.key,
            value: segment.value,
            startDate: iso(baseStart),
            endDate: iso(baseEnd),
          }),
        ]);

        const toMetric = (points: typeof curSeries) =>
          points.map((p) => ({
            date: p.date.slice(0, 10),
            sessions: primaryMetric === 'pageviews' ? p.pageviews : p.sessions,
          }));

        if (curSeries.length > 0) {
          dailySeries = {
            metric: primaryMetric,
            current: toMetric(curSeries),
            baseline: toMetric(baseSeries),
          };
        }
      }

      const references = await db.reference.findMany({
        where: {
          projectId: insight.projectId,
          date: {
            gte: new Date(start.getTime() - 3 * DAY_MS),
            lte: new Date(end.getTime() + DAY_MS),
          },
        },
        orderBy: { date: 'desc' },
        take: 10,
        select: { title: true, date: true },
      });

      const explanation = await generateInsightExplanation({
        insight: {
          title: insight.aiSummary ?? insight.title,
          dimension: insight.dimensionKey,
          window: insight.windowKind,
          summary: insight.summary ?? undefined,
        },
        dailySeries,
        breakdowns,
        references: references.map((r) => ({
          title: r.title,
          date: r.date.toISOString().slice(0, 10),
        })),
      });

      // Only cache a successful explanation — a null is a transient LLM failure
      // and should be retried on the next click.
      if (explanation) {
        await getRedisCache().setex(
          cacheKey,
          EXPLAIN_CACHE_TTL_SEC,
          JSON.stringify(explanation),
        );
      }

      return explanation;
    }),
});
