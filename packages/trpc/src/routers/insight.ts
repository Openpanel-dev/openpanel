import { db } from '@openpanel/db';
import { z } from 'zod';
import { getProjectAccess } from '../access';
import { TRPCAccessError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

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
        throw TRPCAccessError('You do not have access to this project');
      }

      // Fetch more insights than needed to account for deduplication
      const allInsights = await db.projectInsight.findMany({
        where: {
          projectId,
          state: 'active',
          moduleKey: {
            notIn: ['page-trends', 'entry-pages'],
          },
        },
        orderBy: {
          impactScore: 'desc',
        },
        take: limit * 3, // Fetch 3x to account for deduplication
        select: {
          id: true,
          title: true,
          summary: true,
          payload: true,
          currentValue: true,
          compareValue: true,
          changePct: true,
          direction: true,
          moduleKey: true,
          dimensionKey: true,
          windowKind: true,
          severityBand: true,
          firstDetectedAt: true,
          impactScore: true,
        },
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

      // Convert back to array, sort by impactScore, and limit
      const insights = Array.from(deduplicated.values())
        .sort((a, b) => (b.impactScore ?? 0) - (a.impactScore ?? 0))
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
        throw TRPCAccessError('You do not have access to this project');
      }

      const insights = await db.projectInsight.findMany({
        where: {
          projectId,
          state: 'active',
        },
        orderBy: {
          impactScore: 'desc',
        },
        take: limit,
        select: {
          id: true,
          title: true,
          summary: true,
          payload: true,
          currentValue: true,
          compareValue: true,
          changePct: true,
          direction: true,
          moduleKey: true,
          dimensionKey: true,
          windowKind: true,
          severityBand: true,
          firstDetectedAt: true,
          impactScore: true,
        },
      });

      return insights;
    }),
});
