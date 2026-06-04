"use client";

import { useMemo } from "react";
import type { TooltipData } from "./chart-context";
import type { ChartSelection } from "./use-chart-interaction";

interface UseLineSegmentHighlightOptions {
  pathLength: number;
  data: Record<string, unknown>[];
  tooltipData: TooltipData | null;
  selection: ChartSelection | null | undefined;
  xScale: (value: Date | number) => number | undefined;
  yScale: (value: number) => number | undefined;
  xAccessor: (datum: Record<string, unknown>) => Date | number;
  dataKey: string;
}

/**
 * Highlight bounds for the hover/selection overlay.
 *
 * The naive implementation called `path.getPointAtLength` inside a binary
 * search per call — ~30-60 DOM measurements per Line/Area per hover bucket,
 * which made the chart jank on every bucket boundary. This version computes
 * cumulative chord lengths between data points in pixel space (pure
 * arithmetic, memoized on `(data, scales, dataKey)`), then scales them to
 * the real SVG path length so the dasharray offsets still line up with the
 * curved stroke. Same approach as bklit-ui issue #54's approximation.
 */
export function useLineSegmentHighlight({
  pathLength,
  data,
  tooltipData,
  selection,
  xScale,
  yScale,
  xAccessor,
  dataKey,
}: UseLineSegmentHighlightOptions) {
  const chordLengths = useMemo(() => {
    if (data.length < 2) {
      return { lengths: new Float64Array(0), total: 0 };
    }
    const lengths = new Float64Array(data.length);
    lengths[0] = 0;
    let total = 0;

    let prevX = xScale(xAccessor(data[0]!)) ?? 0;
    const firstValue = data[0]![dataKey];
    let prevY =
      typeof firstValue === "number"
        ? (yScale(firstValue) ?? yScale(0) ?? 0)
        : (yScale(0) ?? 0);

    for (let i = 1; i < data.length; i++) {
      const point = data[i]!;
      const x = xScale(xAccessor(point)) ?? 0;
      const value = point[dataKey];
      const y =
        typeof value === "number"
          ? (yScale(value) ?? yScale(0) ?? 0)
          : (yScale(0) ?? 0);
      const dx = x - prevX;
      const dy = y - prevY;
      total += Math.sqrt(dx * dx + dy * dy);
      lengths[i] = total;
      prevX = x;
      prevY = y;
    }
    return { lengths, total };
  }, [data, xScale, yScale, xAccessor, dataKey]);

  return useMemo(() => {
    const { lengths, total: chordTotal } = chordLengths;
    if (lengths.length === 0 || pathLength === 0 || chordTotal === 0) {
      return { startLength: 0, segmentLength: 0, isActive: false };
    }
    // Scale chord-space lengths into SVG path-space so the dasharray on the
    // curved stroke lines up. Assumes roughly uniform curvature — accurate
    // within a couple of pixels for typical chart curves.
    const scale = pathLength / chordTotal;

    if (selection?.active) {
      const startIdx = clampIndex(selection.startIndex, lengths.length);
      const endIdx = clampIndex(selection.endIndex, lengths.length);
      const startLength = (lengths[startIdx] ?? 0) * scale;
      const endLength = (lengths[endIdx] ?? 0) * scale;
      return {
        startLength,
        segmentLength: Math.max(0, endLength - startLength),
        isActive: true,
      };
    }

    if (!tooltipData) {
      return { startLength: 0, segmentLength: 0, isActive: false };
    }

    const idx = tooltipData.index;
    const startIdx = clampIndex(idx - 1, lengths.length);
    const endIdx = clampIndex(idx + 1, lengths.length);
    const startLength = (lengths[startIdx] ?? 0) * scale;
    const endLength = (lengths[endIdx] ?? 0) * scale;
    return {
      startLength,
      segmentLength: Math.max(0, endLength - startLength),
      isActive: true,
    };
  }, [chordLengths, pathLength, tooltipData, selection]);
}

function clampIndex(idx: number, length: number): number {
  if (idx < 0) return 0;
  if (idx >= length) return length - 1;
  return idx;
}
