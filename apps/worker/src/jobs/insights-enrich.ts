import {
  ENRICH_VERSION,
  type InsightToEnrich,
  enrichInsights,
} from '@openpanel/ai';
import { db } from '@openpanel/db';
import { logger as baseLogger } from '@/utils/logger';

const logger = baseLogger.child({ job: 'insights-enrich' });

// Modest batches keep the prompt small and the id-mapping reliable. At Tier 3
// limits (4M TPM / 5k RPM) even the first-run backlog clears comfortably.
const BATCH_SIZE = 25;

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Tier-1 enrichment for one project's active insights. Runs after the insight
 * engine finishes a project, scoring anything new, materially-changed, or
 * enriched under an older prompt version. Failures are logged and skipped — a
 * bad enrichment batch must never fail the insights job itself.
 */
export async function enrichProjectInsights(projectId: string): Promise<void> {
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

  if (stale.length === 0) return;

  let enriched = 0;
  for (let i = 0; i < stale.length; i += BATCH_SIZE) {
    const batch = stale.slice(i, i + BATCH_SIZE);
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
        'Enrichment call failed; skipping batch',
      );
      continue;
    }

    const byId = new Map(results.map((r) => [r.id, r]));
    for (const row of batch) {
      const e = byId.get(row.id);
      if (!e) continue;
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
    'Insight enrichment complete',
  );
}
