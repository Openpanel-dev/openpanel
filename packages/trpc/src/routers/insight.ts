import { generateInsightExplanation } from '@openpanel/ai';
import { db, getTrafficBreakdownCore } from '@openpanel/db';
import { z } from 'zod';
import { getProjectAccess } from '../access';
import { TRPCForbiddenError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const DAY_MS = 24 * 60 * 60 * 1000;
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
  // the AI explain which sub-segment drove it. On-demand (a button), not cached.
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
        },
      });

      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: insight.projectId,
      });

      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this project');
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

      return generateInsightExplanation({
        insight: {
          title: insight.aiSummary ?? insight.title,
          dimension: insight.dimensionKey,
          window: insight.windowKind,
          summary: insight.summary ?? undefined,
        },
        breakdowns,
        references: references.map((r) => ({
          title: r.title,
          date: r.date.toISOString().slice(0, 10),
        })),
      });
    }),
});
