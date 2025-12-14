import crypto from 'node:crypto';
import { materialDecision } from './material';
import { defaultImpactScore, severityBand } from './scoring';
import type {
  Cadence,
  ComputeContext,
  ComputeResult,
  ExplainQueue,
  InsightModule,
  InsightStore,
  WindowKind,
} from './types';
import { resolveWindow } from './windows';

export interface EngineConfig {
  keepTopNPerModuleWindow: number; // e.g. 5
  closeStaleAfterDays: number; // e.g. 7
  dimensionBatchSize: number; // e.g. 50
  globalThresholds: {
    minTotal: number; // e.g. 200
    minAbsDelta: number; // e.g. 80
    minPct: number; // e.g. 0.15
  };
  enableExplain: boolean;
  explainTopNPerProjectPerDay: number; // e.g. 3
}

/** Simple gating to cut noise; modules can override via thresholds. */
function passesThresholds(
  r: ComputeResult,
  mod: InsightModule,
  cfg: EngineConfig,
): boolean {
  const t = mod.thresholds ?? {};
  const minTotal = t.minTotal ?? cfg.globalThresholds.minTotal;
  const minAbsDelta = t.minAbsDelta ?? cfg.globalThresholds.minAbsDelta;
  const minPct = t.minPct ?? cfg.globalThresholds.minPct;
  const cur = r.currentValue ?? 0;
  const cmp = r.compareValue ?? 0;
  const total = cur + cmp;
  const absDelta = Math.abs(cur - cmp);
  const pct = Math.abs(r.changePct ?? 0);
  if (total < minTotal) return false;
  if (absDelta < minAbsDelta) return false;
  if (pct < minPct) return false;
  return true;
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sha256(x: string) {
  return crypto.createHash('sha256').update(x).digest('hex');
}

/**
 * Engine entrypoint: runs all projects for a cadence.
 * Recommended: call this from a per-project worker (fanout), but it can also run directly.
 */
export function createEngine(args: {
  store: InsightStore;
  modules: InsightModule[];
  db: any;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  explainQueue?: ExplainQueue;
  config: EngineConfig;
}) {
  const { store, modules, db, explainQueue, config } = args;
  const logger = args.logger ?? console;

  async function runCadence(cadence: Cadence, now: Date): Promise<void> {
    const projectIds = await store.listProjectIdsForCadence(cadence);
    for (const projectId of projectIds) {
      await runProject({ projectId, cadence, now });
    }
  }

  async function runProject(opts: {
    projectId: string;
    cadence: Cadence;
    now: Date;
  }): Promise<void> {
    const { projectId, cadence, now } = opts;
    const projLogger = logger;
    const eligible = modules.filter((m) => m.cadence.includes(cadence));

    // Track top insights (by impact) for optional explain step across all modules/windows
    const explainCandidates: Array<{
      insightId: string;
      impact: number;
      evidence: any;
      evidenceHash: string;
    }> = [];

    for (const mod of eligible) {
      for (const windowKind of mod.windows) {
        const window = resolveWindow(windowKind as WindowKind, now);
        const ctx: ComputeContext = {
          projectId,
          window,
          db,
          now,
          logger: projLogger,
        };

        // 1) enumerate dimensions
        let dims = mod.enumerateDimensions
          ? await mod.enumerateDimensions(ctx)
          : [];
        const maxDims = mod.thresholds?.maxDims ?? 25;
        if (dims.length > maxDims) dims = dims.slice(0, maxDims);

        if (dims.length === 0) {
          // Still do lifecycle close / suppression based on "nothing emitted"
          await store.closeMissingActiveInsights({
            projectId,
            moduleKey: mod.key,
            windowKind,
            seenDimensionKeys: [],
            now,
            staleDays: config.closeStaleAfterDays,
          });

          await store.applySuppression({
            projectId,
            moduleKey: mod.key,
            windowKind,
            keepTopN: config.keepTopNPerModuleWindow,
            now,
          });

          continue;
        }

        // 2) compute in batches
        const seen: string[] = [];
        const dimBatches = chunk(dims, config.dimensionBatchSize);
        for (const batch of dimBatches) {
          let results: ComputeResult[] = [];
          try {
            results = await mod.computeMany(ctx, batch);
          } catch (e) {
            projLogger.error('[insights] module computeMany failed', {
              projectId,
              module: mod.key,
              windowKind,
              err: e,
            });
            continue;
          }

          for (const r of results) {
            if (!r?.ok) continue;
            if (!r.dimensionKey) continue;

            // 3) gate noise
            if (!passesThresholds(r, mod, config)) continue;

            // 4) score
            const impact = mod.score
              ? mod.score(r, ctx)
              : defaultImpactScore(r);
            const sev = severityBand(r.changePct);

            // 5) dedupe/material change requires loading prev identity
            const prev = await store.getActiveInsightByIdentity({
              projectId,
              moduleKey: mod.key,
              dimensionKey: r.dimensionKey,
              windowKind,
            });

            const decision = materialDecision(prev, {
              changePct: r.changePct,
              direction: r.direction,
            });

            // 6) render
            const card = mod.render(r, ctx);

            // 7) upsert
            const persisted = await store.upsertInsight({
              projectId,
              moduleKey: mod.key,
              dimensionKey: r.dimensionKey,
              window,
              card,
              metrics: {
                currentValue: r.currentValue,
                compareValue: r.compareValue,
                changePct: r.changePct,
                direction: r.direction,
                impactScore: impact,
                severityBand: sev,
              },
              now,
              decision,
              prev,
            });

            seen.push(r.dimensionKey);

            // 8) events only when material
            if (!prev) {
              await store.insertEvent({
                projectId,
                insightId: persisted.id,
                moduleKey: mod.key,
                dimensionKey: r.dimensionKey,
                windowKind,
                eventKind: 'created',
                changeFrom: null,
                changeTo: {
                  title: card.title,
                  changePct: r.changePct,
                  direction: r.direction,
                  impact,
                  severityBand: sev,
                },
                now,
              });
            } else if (decision.material) {
              const eventKind =
                decision.reason === 'direction_flip'
                  ? 'direction_flip'
                  : decision.reason === 'severity_change'
                    ? sev && prev.severityBand && sev > prev.severityBand
                      ? 'severity_up'
                      : 'severity_down'
                    : 'updated';

              await store.insertEvent({
                projectId,
                insightId: persisted.id,
                moduleKey: mod.key,
                dimensionKey: r.dimensionKey,
                windowKind,
                eventKind,
                changeFrom: {
                  changePct: prev.changePct,
                  direction: prev.direction,
                  impactScore: prev.impactScore,
                  severityBand: prev.severityBand,
                },
                changeTo: {
                  changePct: r.changePct,
                  direction: r.direction,
                  impactScore: impact,
                  severityBand: sev,
                },
                now,
              });
            }

            // 9) optional AI explain candidates (only for top-impact insights)
            if (config.enableExplain && explainQueue && mod.drivers) {
              // compute evidence deterministically (drivers)
              try {
                const drivers = await mod.drivers(r, ctx);
                const evidence = {
                  insight: {
                    moduleKey: mod.key,
                    dimensionKey: r.dimensionKey,
                    windowKind,
                    currentValue: r.currentValue,
                    compareValue: r.compareValue,
                    changePct: r.changePct,
                    direction: r.direction,
                  },
                  drivers,
                  window: {
                    start: window.start.toISOString().slice(0, 10),
                    end: window.end.toISOString().slice(0, 10),
                    baselineStart: window.baselineStart
                      .toISOString()
                      .slice(0, 10),
                    baselineEnd: window.baselineEnd.toISOString().slice(0, 10),
                  },
                };
                const evidenceHash = sha256(JSON.stringify(evidence));
                explainCandidates.push({
                  insightId: persisted.id,
                  impact,
                  evidence,
                  evidenceHash,
                });
              } catch (e) {
                projLogger.warn('[insights] drivers() failed', {
                  projectId,
                  module: mod.key,
                  dimensionKey: r.dimensionKey,
                  err: e,
                });
              }
            }
          }
        }

        // 10) lifecycle: close missing insights for this module/window
        await store.closeMissingActiveInsights({
          projectId,
          moduleKey: mod.key,
          windowKind,
          seenDimensionKeys: seen,
          now,
          staleDays: config.closeStaleAfterDays,
        });

        // 11) suppression: keep top N
        await store.applySuppression({
          projectId,
          moduleKey: mod.key,
          windowKind,
          keepTopN: config.keepTopNPerModuleWindow,
          now,
        });
      }
    }

    // 12) enqueue explains for top insights across the whole project run
    if (config.enableExplain && explainQueue) {
      explainCandidates.sort((a, b) => b.impact - a.impact);
      const top = explainCandidates.slice(
        0,
        config.explainTopNPerProjectPerDay,
      );
      for (const c of top) {
        await explainQueue.enqueueExplain({
          insightId: c.insightId,
          projectId,
          moduleKey: 'n/a', // optional; you can include it in evidence instead
          dimensionKey: 'n/a',
          windowKind: 'yesterday',
          evidence: c.evidence,
          evidenceHash: c.evidenceHash,
        });
      }
    }
  }

  return { runCadence, runProject };
}
