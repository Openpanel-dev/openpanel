import type { HeatmapColumn } from './heatmap-context';

/** Placeholder grid with the same week/day shape as target data (all empty cells). */
export function generateHeatmapSkeletonFromTarget(
  target: HeatmapColumn[]
): HeatmapColumn[] {
  return target.map((column) => ({
    bin: column.bin,
    bins: column.bins.map((bin) => ({
      bin: bin.bin,
      count: 0,
      date: bin.date,
    })),
  }));
}
