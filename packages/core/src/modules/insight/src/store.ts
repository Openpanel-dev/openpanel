// M10-009: the store is a FACTORY over `ServiceDeps` — `deps.db` is the boot
// scope's client, so the requestId minted at the edge reaches every insight
// write (ADR-018, docs/TECH_DEBT.md §4). `Prisma` here is the namespace's JSON
// sentinel (`DbNull`), reached through `context.ts`'s declared seam
// (`prismaSentinels()`) rather than by importing `@openpanel/db` from core.

import type { Prisma } from '@openpanel/db/src/prisma-client';
import type { ServiceDeps } from '../../../services';
import type {
  Cadence,
  InsightStore,
  PersistedInsight,
  WindowKind,
} from './types';

/** `Prisma.DbNull` is a plain sentinel value that lives in the same module as
 *  the constructed client — reached through `context.ts`'s seam so this file
 *  value-imports nothing from `@openpanel/db`. Lazy: `context.ts`
 *  value-imports `services.ts`, and this module is part of that graph. */
function loadPrismaSentinels() {
  return import('../../../context').then((m) => m.prismaSentinels());
}

export function createInsightStore(deps: ServiceDeps): InsightStore {
  const db = deps.db;
  return {
  // `cadence` isn't read — there is only one today ('daily') — but it stays
  // on the signature because InsightStore's contract names it (V1 parity).
  async listProjectIdsForCadence(_cadence: Cadence): Promise<string[]> {
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

    if (!insight) {
      return null;
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
          // Materially-changed insights need re-enrichment; clearing enrichedAt
          // re-queues them for the AI pass. Keep the old score/summary as a
          // fallback until then (don't null those).
          ...(decision.material ? { enrichedAt: null } : {}),
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
            // Reopening is a material event — re-enrich it.
            enrichedAt: null,
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

  // projectId/moduleKey/dimensionKey/windowKind aren't persisted here — the
  // insight_events row is scoped by insightId alone, they're derivable from
  // the parent (V1 parity) — but the engine passes them for identity/logging
  // symmetry with the store's other methods, so they stay on the signature.
  async insertEvent({
    insightId,
    eventKind,
    changeFrom,
    changeTo,
    now,
  }): Promise<void> {
    const { DbNull } = await loadPrismaSentinels();
    await db.insightEvent.create({
      data: {
        insightId,
        eventKind,
        changeFrom: changeFrom
          ? (changeFrom as Prisma.InputJsonValue)
          : DbNull,
        changeTo: changeTo
          ? (changeTo as Prisma.InputJsonValue)
          : DbNull,
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
  }): Promise<{ deleted: number }> {
    // Below-top-N insights are DELETED rather than persisted as `suppressed`
    // rows. Nothing reads suppressed insights (every query filters state=active),
    // yet they were ~75% of the table. A dimension that later climbs back into
    // the top-N is simply re-created on the next run — it loses thread
    // continuity, which is cosmetic and not surfaced anywhere.
    const insights = await db.projectInsight.findMany({
      where: {
        projectId,
        moduleKey,
        windowKind,
        state: 'active',
      },
      orderBy: { impactScore: 'desc' },
    });

    if (insights.length === 0) {
      return { deleted: 0 };
    }

    const toDelete: string[] = [];

    if (windowKind === 'yesterday') {
      // Drop stale "yesterday" insights whose windowEnd isn't actually
      // yesterday (prevents showing "Yesterday traffic dropped" from 2+ days
      // ago), then apply top-N to the fresh remainder.
      const yesterday = new Date(now);
      yesterday.setUTCHours(0, 0, 0, 0);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayTime = yesterday.getTime();

      const fresh: typeof insights = [];
      for (const insight of insights) {
        const isStale = insight.windowEnd
          ? new Date(insight.windowEnd).setUTCHours(0, 0, 0, 0) !==
            yesterdayTime
          : true;
        if (isStale) {
          toDelete.push(insight.id);
        } else {
          fresh.push(insight);
        }
      }
      // `fresh` preserves the impactScore-desc order; everything past keepTopN goes.
      for (const insight of fresh.slice(keepTopN)) {
        toDelete.push(insight.id);
      }
    } else {
      for (const insight of insights.slice(keepTopN)) {
        toDelete.push(insight.id);
      }
    }

    if (toDelete.length === 0) {
      return { deleted: 0 };
    }

    const result = await db.projectInsight.deleteMany({
      where: { id: { in: toDelete } },
    });
    return { deleted: result.count };
  },
  };
}
