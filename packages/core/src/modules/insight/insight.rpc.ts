// Ported from packages/trpc/src/routers/insight.ts (M5-001).
//
// M11-001: every procedure is on its V1 twin's builder.
// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE
// the input parser, exactly as V1 does. The explicit checks in the handlers
// below stay: `enforceAccess` only sees a TOP-LEVEL `projectId` /
// `organizationId`, so anything resolved from another id needs its own
// (ADR-011).
//
// The permission ladder itself is bound once, in auth.service.ts
// (M10-002); every procedure here reaches it through `ctx.services.auth`.

import type { InsightPayload } from '@openpanel/validation';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { TRPCAccessError } from '../../rpc/errors';

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPLAIN_COLUMNS = [
  'referrer_name',
  'country',
  'device',
  'utm_source',
] as const;

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const insightRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        limit: z.number().min(1).max(100).optional().default(50),
      })
    )
    .query(async ({ input: { projectId, limit }, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId,
        level: 'read',
      });

      // Fetch more than needed to account for deduplication. AI
      // relevanceScore leads (un-enriched insights sort last via
      // nulls:last), with the statistical impactScore as the tiebreaker.
      const allInsights = await ctx.services.insight.listInsights({
        projectId,
        limit: limit * 3,
      });

      // WindowKind priority: yesterday (1) > rolling_7d (2) > rolling_30d (3)
      const windowKindPriority: Record<string, number> = {
        yesterday: 1,
        rolling_7d: 2,
        rolling_30d: 3,
      };

      // Group by moduleKey + dimensionKey, keep only the highest-priority
      // windowKind.
      const deduplicated = new Map<string, (typeof allInsights)[0]>();
      for (const insight of allInsights) {
        const key = `${insight.moduleKey}:${insight.dimensionKey}`;
        const existing = deduplicated.get(key);
        const currentPriority = windowKindPriority[insight.windowKind] ?? 999;
        const existingPriority = existing
          ? (windowKindPriority[existing.windowKind] ?? 999)
          : 999;

        if (!existing || currentPriority < existingPriority) {
          deduplicated.set(key, insight);
        }
      }

      return Array.from(deduplicated.values())
        .sort(
          (a, b) =>
            (b.relevanceScore ?? -1) - (a.relevanceScore ?? -1) ||
            (b.impactScore ?? 0) - (a.impactScore ?? 0)
        )
        .slice(0, limit)
        .map(({ impactScore, ...rest }) => rest); // strip impactScore from the response
    }),

  listAll: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        limit: z.number().min(1).max(500).optional().default(200),
      })
    )
    .query(async ({ input: { projectId, limit }, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId,
        level: 'read',
      });

      return ctx.services.insight.listAllInsights({ projectId, limit });
    }),

  // Phase 5: the "why". Decompose the insight's change across referrer/
  // country/device/utm (current vs baseline window), pull nearby references,
  // and have the AI explain which sub-segment drove it. Cached per insight
  // version so repeat clicks don't re-bill the LLM.
  explain: protectedProcedure
    .input(z.object({ insightId: z.string() }))
    .mutation(async ({ input: { insightId }, ctx }) => {
      const userId = requireLogin(ctx.session.userId);

      const db = ctx.db;
      const { getSegmentDailySeriesCore, getTrafficBreakdownCore } =
        await import('../../v1-compat');

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

      // Reads an existing insight and explains it. Nothing about the project
      // changes, so a read-level member may do it.
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: insight.projectId,
        level: 'read',
      });

      const cacheKey = `insight-explain:${insightId}:${insight.lastUpdatedAt.getTime()}`;

      const end = insight.windowEnd ?? new Date();
      const start = insight.windowStart ?? new Date(end.getTime() - 7 * DAY_MS);
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
        })
      );

      // Daily series for the insight's own segment, so the model can read
      // the shape of the change (a one-off spike vs sustained growth)
      // instead of only current-vs-baseline totals. Best-effort.
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

      return ctx.services.insight.explainInsight(
        {
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
        },
        cacheKey
      );
    }),
});
