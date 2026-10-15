import type { Transition } from 'motion/react';
import type { HeatmapColumn } from './heatmap-context';
import { getHeatmapContributionLevel } from './heatmap-utils';

/** Default enter duration when no motion props are passed (ms). */
export const HEATMAP_DEFAULT_ENTER_DURATION_MS = 1600;

/** Default cubic-bezier for heatmap cell enter / loading transitions. */
export const HEATMAP_DEFAULT_ENTER_EASE = [0.85, 0, 0.916, 0.282] as const;

/** Default enter transition for {@link HeatmapChart}. */
export const HEATMAP_DEFAULT_ENTER_TRANSITION: Transition = {
  type: 'tween',
  duration: HEATMAP_DEFAULT_ENTER_DURATION_MS / 1000,
  ease: HEATMAP_DEFAULT_ENTER_EASE,
};

/** Chart opacity while `status="loading"`. */
export const HEATMAP_LOADING_CHART_OPACITY = 1;

/** Default max per-cell opacity during loading shimmer. */
export const HEATMAP_DEFAULT_LOADING_CELL_MAX_OPACITY = 0.85;

/** Default share of cells that participate in loading shimmer (0–1). */
export const HEATMAP_DEFAULT_LOADING_CELL_RANDOMNESS = 1;

/** Opacity for loading cells that do not participate in shimmer. */
export const HEATMAP_LOADING_BASE_CELL_OPACITY = 0.2;

/** Duration for ready → loading cell conceal before shimmer resumes (ms). */
export const HEATMAP_LOADING_CONCEAL_MS = 450;

/** Share of the enter window used for random fade-in delays. */
export const HEATMAP_ENTER_STAGGER_SPREAD = 0.6;

function seededRandom(seed: number): () => number {
  let state = seed % 2_147_483_647;
  if (state <= 0) {
    state += 2_147_483_646;
  }
  return () => {
    state = (state * 16_807) % 2_147_483_647;
    return (state - 1) / 2_147_483_646;
  };
}

export function heatmapCellSeed(column: number, row: number): number {
  return column * 1009 + row * 9176;
}

export interface HeatmapLevelRange {
  min: number;
  max: number;
}

/** Min/max contribution levels present in the dataset. */
export function computeHeatmapLevelRange(
  data: HeatmapColumn[]
): HeatmapLevelRange {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const column of data) {
    for (const bin of column.bins) {
      const level = getHeatmapContributionLevel(bin.count);
      if (level < min) {
        min = level;
      }
      if (level > max) {
        max = level;
      }
    }
  }

  if (!(Number.isFinite(min) && Number.isFinite(max))) {
    return { min: 0, max: 4 };
  }

  return { min, max };
}

/** Per-cell fade duration derived from the motion enter transition. */
export function resolveHeatmapEnterFadeDurationSec(
  enterTransition: Transition | undefined,
  animationDurationMs: number
): number {
  if (
    enterTransition &&
    'duration' in enterTransition &&
    typeof enterTransition.duration === 'number'
  ) {
    return enterTransition.duration;
  }

  return Math.min(0.45, (animationDurationMs / 1000) * 0.3);
}

/** Random delay so all cells finish fading in within `animationDurationMs`. */
export function computeHeatmapEnterFadeDelayMs({
  column,
  row,
  revealEpoch,
  animationDurationMs,
  enterStaggerScale,
  fadeDurationSec,
}: {
  column: number;
  row: number;
  revealEpoch: number;
  animationDurationMs: number;
  enterStaggerScale: number;
  fadeDurationSec: number;
}): number {
  const random = seededRandom(
    heatmapCellSeed(column, row) + revealEpoch * 524_287
  );
  const fadeMs = fadeDurationSec * 1000;
  const maxDelayMs = Math.max(0, animationDurationMs - fadeMs);
  const spreadMs =
    maxDelayMs *
    HEATMAP_ENTER_STAGGER_SPREAD *
    Math.max(enterStaggerScale, 0.25);

  return random() * spreadMs;
}

/** Whether a cell participates in loading shimmer for a given randomness (0–1). */
export function heatmapLoadingCellParticipates(
  column: number,
  row: number,
  randomness: number
): boolean {
  if (randomness >= 1) {
    return true;
  }
  if (randomness <= 0) {
    return false;
  }

  const random = seededRandom(heatmapCellSeed(column, row) + 73_133);
  return random() < randomness;
}
