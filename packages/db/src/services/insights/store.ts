import { Prisma, db } from '../../prisma-client';
import type {
  Cadence,
  InsightStore,
  PersistedInsight,
  RenderedCard,
  WindowKind,
  WindowRange,
} from './types';

export const insightStore: InsightStore = {
  async listProjectIdsForCadence(cadence: Cadence): Promise<string[]> {
    const projects = await db.project.findMany({
      where: {
        deleteAt: null,
        eventsCount: { gt: 10_000 },
        updatedAt: { gt: new Date(Date.now() - 1000 * 60 * 60 * 24) },
        organization: {
          subscriptionStatus: 'active',
        },
      },
      select: { id: true },
    });
    return projects.map((p) => p.id);
  },

  async getProjectCreatedAt(projectId: string): Promise<Date | null> {
    const project = await db.project.findFirst({
      where: { id: projectId, deleteAt: null },
      select: { createdAt: true },
    });
    return project?.createdAt ?? null;
  },

  async getActiveInsightByIdentity({
    projectId,
    moduleKey,
    dimensionKey,
    windowKind,
  }): Promise<PersistedInsight | null> {
    const insight = await db.projectInsight.findFirst({
      where: {
        projectId,
        moduleKey,
        dimensionKey,
        windowKind,
        state: 'active',
      },
    });

    if (!insight) return null;

    return {
      id: insight.id,
      projectId: insight.projectId,
      moduleKey: insight.moduleKey,
      dimensionKey: insight.dimensionKey,
      windowKind: insight.windowKind as WindowKind,
      state: insight.state as 'active' | 'suppressed' | 'closed',
      version: insight.version,
      impactScore: insight.impactScore,
      lastSeenAt: insight.lastSeenAt,
      lastUpdatedAt: insight.lastUpdatedAt,
      direction: insight.direction,
      severityBand: insight.severityBand,
    };
  },

  async upsertInsight({
    projectId,
    moduleKey,
    dimensionKey,
    window,
    card,
    metrics,
    now,
    decision,
    prev,
  }): Promise<PersistedInsight> {
    const baseData = {
      projectId,
      moduleKey,
      dimensionKey,
      windowKind: window.kind,
      state: prev?.state === 'closed' ? 'active' : (prev?.state ?? 'active'),
      title: card.title,
      summary: card.summary ?? null,
      displayName: card.displayName,
      payload: card.payload,
      direction: metrics.direction ?? null,
      impactScore: metrics.impactScore,
      severityBand: metrics.severityBand ?? null,
      version: prev ? (decision.material ? prev.version + 1 : prev.version) : 1,
      windowStart: window.start,
      windowEnd: window.end,
      lastSeenAt: now,
      lastUpdatedAt: now,
    };

    // Try to find existing insight first
    const existing = prev
      ? await db.projectInsight.findFirst({
          where: {
            projectId,
            moduleKey,
            dimensionKey,
            windowKind: window.kind,
            state: prev.state,
          },
        })
      : null;

    let insight: any;
    if (existing) {
      // Update existing
      insight = await db.projectInsight.update({
        where: { id: existing.id },
        data: {
          ...baseData,
          threadId: existing.threadId, // Preserve threadId
        },
      });
    } else {
      // Create new - need to check if there's a closed/suppressed one to reopen
      const closed = await db.projectInsight.findFirst({
        where: {
          projectId,
          moduleKey,
          dimensionKey,
          windowKind: window.kind,
          state: { in: ['closed', 'suppressed'] },
        },
        orderBy: { lastUpdatedAt: 'desc' },
      });

      if (closed) {
        // Reopen and update
        insight = await db.projectInsight.update({
          where: { id: closed.id },
          data: {
            ...baseData,
            state: 'active',
            threadId: closed.threadId, // Preserve threadId
          },
        });
      } else {
        // Create new
        insight = await db.projectInsight.create({
          data: {
            ...baseData,
            firstDetectedAt: now,
          },
        });
      }
    }

    return {
      id: insight.id,
      projectId: insight.projectId,
      moduleKey: insight.moduleKey,
      dimensionKey: insight.dimensionKey,
      windowKind: insight.windowKind as WindowKind,
      state: insight.state as 'active' | 'suppressed' | 'closed',
      version: insight.version,
      impactScore: insight.impactScore,
      lastSeenAt: insight.lastSeenAt,
      lastUpdatedAt: insight.lastUpdatedAt,
      direction: insight.direction,
      severityBand: insight.severityBand,
    };
  },

  async insertEvent({
    projectId,
    insightId,
    moduleKey,
    dimensionKey,
    windowKind,
    eventKind,
    changeFrom,
    changeTo,
    now,
  }): Promise<void> {
    await db.insightEvent.create({
      data: {
        insightId,
        eventKind,
        changeFrom: changeFrom
          ? (changeFrom as Prisma.InputJsonValue)
          : Prisma.DbNull,
        changeTo: changeTo
          ? (changeTo as Prisma.InputJsonValue)
          : Prisma.DbNull,
        createdAt: now,
      },
    });
  },

  async closeMissingActiveInsights({
    projectId,
    moduleKey,
    windowKind,
    seenDimensionKeys,
    now,
    staleDays,
  }): Promise<number> {
    const staleDate = new Date(now);
    staleDate.setDate(staleDate.getDate() - staleDays);

    const result = await db.projectInsight.updateMany({
      where: {
        projectId,
        moduleKey,
        windowKind,
        state: 'active',
        lastSeenAt: { lt: staleDate },
        dimensionKey: { notIn: seenDimensionKeys },
      },
      data: {
        state: 'closed',
        lastUpdatedAt: now,
      },
    });

    return result.count;
  },

  async applySuppression({
    projectId,
    moduleKey,
    windowKind,
    keepTopN,
    now,
  }): Promise<{ suppressed: number; unsuppressed: number }> {
    // Get all active insights for this module/window, ordered by impactScore desc
    const insights = await db.projectInsight.findMany({
      where: {
        projectId,
        moduleKey,
        windowKind,
        state: { in: ['active', 'suppressed'] },
      },
      orderBy: { impactScore: 'desc' },
    });

    if (insights.length === 0) {
      return { suppressed: 0, unsuppressed: 0 };
    }

    let suppressed = 0;
    let unsuppressed = 0;

    // For "yesterday" insights, suppress any that are stale (windowEnd is not actually yesterday)
    // This prevents showing confusing insights like "Yesterday traffic dropped" when it's from 2+ days ago
    if (windowKind === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setUTCHours(0, 0, 0, 0);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayTime = yesterday.getTime();

      for (const insight of insights) {
        // If windowEnd is null, consider it stale
        const isStale = insight.windowEnd
          ? new Date(insight.windowEnd).setUTCHours(0, 0, 0, 0) !==
            yesterdayTime
          : true;

        if (isStale && insight.state === 'active') {
          await db.projectInsight.update({
            where: { id: insight.id },
            data: { state: 'suppressed', lastUpdatedAt: now },
          });
          suppressed++;
        }
      }

      // Filter to only non-stale insights for top-N logic
      const freshInsights = insights.filter((insight) => {
        if (!insight.windowEnd) return false;
        const windowEndTime = new Date(insight.windowEnd).setUTCHours(
          0,
          0,
          0,
          0,
        );
        return windowEndTime === yesterdayTime;
      });

      const topN = freshInsights.slice(0, keepTopN);
      const belowN = freshInsights.slice(keepTopN);

      for (const insight of belowN) {
        if (insight.state === 'active') {
          await db.projectInsight.update({
            where: { id: insight.id },
            data: { state: 'suppressed', lastUpdatedAt: now },
          });
          suppressed++;
        }
      }

      for (const insight of topN) {
        if (insight.state === 'suppressed') {
          await db.projectInsight.update({
            where: { id: insight.id },
            data: { state: 'active', lastUpdatedAt: now },
          });
          unsuppressed++;
        }
      }

      return { suppressed, unsuppressed };
    }

    // For non-yesterday windows, apply standard top-N suppression
    const topN = insights.slice(0, keepTopN);
    const belowN = insights.slice(keepTopN);

    // Suppress those below top N
    for (const insight of belowN) {
      if (insight.state === 'active') {
        await db.projectInsight.update({
          where: { id: insight.id },
          data: { state: 'suppressed', lastUpdatedAt: now },
        });
        suppressed++;
      }
    }

    // Unsuppress those in top N
    for (const insight of topN) {
      if (insight.state === 'suppressed') {
        await db.projectInsight.update({
          where: { id: insight.id },
          data: { state: 'active', lastUpdatedAt: now },
        });
        unsuppressed++;
      }
    }

    return { suppressed, unsuppressed };
  },
};
