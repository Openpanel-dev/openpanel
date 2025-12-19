import { createCachedClix } from './cached-clix';
import { materialDecision } from './material';
import { defaultImpactScore, severityBand } from './scoring';
import type {
  Cadence,
  ComputeContext,
  ComputeResult,
  InsightModule,
  InsightStore,
  WindowKind,
} from './types';
import { resolveWindow } from './windows';

const DEFAULT_WINDOWS: WindowKind[] = [
  'yesterday',
  'rolling_7d',
  'rolling_30d',
];

/**
 * Sanitize a string for PostgreSQL by removing null bytes (0x00).
 * PostgreSQL text columns don't accept null bytes in UTF-8 encoding.
 */
function sanitizeForPostgres(str: string): string {
  // Remove null bytes which cause "invalid byte sequence for encoding UTF8: 0x00"
  // Using String.fromCharCode(0) to avoid linter warnings about control characters in regex
  return str.split(String.fromCharCode(0)).join('');
}

export interface EngineConfig {
  keepTopNPerModuleWindow: number; // e.g. 5
  closeStaleAfterDays: number; // e.g. 7
  dimensionBatchSize: number; // e.g. 50
  globalThresholds: {
    minTotal: number; // e.g. 200
    minAbsDelta: number; // e.g. 80
    minPct: number; // e.g. 0.15
  };
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

export function createEngine(args: {
  store: InsightStore;
  modules: InsightModule[];
  db: any;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  config: EngineConfig;
}) {
  const { store, modules, db, config } = args;
  const logger = args.logger ?? console;

  function isProjectOldEnoughForWindow(
    projectCreatedAt: Date | null | undefined,
    baselineStart: Date,
  ): boolean {
    if (!projectCreatedAt) return true; // best-effort; don't block if unknown
    return projectCreatedAt.getTime() <= baselineStart.getTime();
  }

  async function runProject(opts: {
    projectId: string;
    cadence: Cadence;
    now: Date;
    projectCreatedAt?: Date | null;
  }): Promise<void> {
    const { projectId, cadence, now, projectCreatedAt } = opts;
    const projLogger = logger;
    const eligible = modules.filter((m) => m.cadence.includes(cadence));

    for (const mod of eligible) {
      const windows = mod.windows ?? DEFAULT_WINDOWS;
      for (const windowKind of windows) {
        let window: ReturnType<typeof resolveWindow>;
        let ctx: ComputeContext;
        try {
          window = resolveWindow(windowKind, now);
          if (
            !isProjectOldEnoughForWindow(projectCreatedAt, window.baselineStart)
          ) {
            continue;
          }
          // Initialize cache for this module+window combination.
          // Cache is automatically garbage collected when context goes out of scope.
          const cache = new Map<string, any>();
          ctx = {
            projectId,
            window,
            db,
            now,
            logger: projLogger,
            clix: createCachedClix(db, cache),
          };
        } catch (e) {
          projLogger.error('[insights] failed to create compute context', {
            projectId,
            module: mod.key,
            windowKind,
            err: e,
          });
          continue;
        }

        // 1) enumerate dimensions
        let dims: string[] = [];
        try {
          const rawDims = mod.enumerateDimensions
            ? await mod.enumerateDimensions(ctx)
            : [];
          // Sanitize dimension keys to remove null bytes that PostgreSQL can't handle
          dims = rawDims.map(sanitizeForPostgres);
        } catch (e) {
          // Important: enumeration failures should not abort the whole project run.
          // Also avoid lifecycle close/suppression when we didn't actually evaluate dims.
          projLogger.error('[insights] module enumerateDimensions failed', {
            projectId,
            module: mod.key,
            windowKind,
            err: e,
          });
          continue;
        }
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

            // Sanitize dimensionKey to remove null bytes that PostgreSQL can't handle
            r.dimensionKey = sanitizeForPostgres(r.dimensionKey);

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
  }

  return { runProject };
}
