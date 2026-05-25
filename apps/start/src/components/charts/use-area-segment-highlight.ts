"use client";

import { useCallback, useMemo } from "react";
import type { TooltipData } from "./chart-context";
import type { ChartSelection } from "./use-chart-interaction";

interface UseAreaSegmentHighlightOptions {
  data: Record<string, unknown>[];
  dataKey: string;
  tooltipData: TooltipData | null;
  selection: ChartSelection | null | undefined;
  xScale: (value: Date | number) => number | undefined;
  yScale: (value: number) => number | undefined;
  xAccessor: (datum: Record<string, unknown>) => Date | number;
}

function buildChordMetrics(
  data: Record<string, unknown>[],
  getY: (datum: Record<string, unknown>) => number,
  xScale: (value: Date | number) => number | undefined,
  xAccessor: (datum: Record<string, unknown>) => Date | number
) {
  const cumulative: number[] = [0];
  let total = 0;
  for (let i = 1; i < data.length; i++) {
    const d0 = data[i - 1];
    const d1 = data[i];
    if (!(d0 && d1)) {
      continue;
    }
    const x0 = xScale(xAccessor(d0)) ?? 0;
    const x1 = xScale(xAccessor(d1)) ?? 0;
    const y0 = getY(d0);
    const y1 = getY(d1);
    total += Math.hypot(x1 - x0, y1 - y0);
    cumulative.push(total);
  }
  return { cumulative, total };
}

function approximateLengthAtX(
  targetX: number,
  data: Record<string, unknown>[],
  chordMetrics: { cumulative: number[]; total: number },
  xScale: (value: Date | number) => number | undefined,
  xAccessor: (datum: Record<string, unknown>) => Date | number
) {
  if (data.length < 2) {
    return 0;
  }
  const { cumulative } = chordMetrics;
  for (let i = 1; i < data.length; i++) {
    const dPrev = data[i - 1];
    const dCur = data[i];
    if (!(dPrev && dCur)) {
      continue;
    }
    const x0 = xScale(xAccessor(dPrev)) ?? 0;
    const x1 = xScale(xAccessor(dCur)) ?? 0;
    const atLast = i === data.length - 1;
    const spanEnd = Math.max(x0, x1);
    if (targetX <= spanEnd || atLast) {
      const prev = cumulative[i - 1] ?? 0;
      const segLen = (cumulative[i] ?? 0) - prev;
      const denom = x1 - x0;
      if (Math.abs(denom) < 1e-6) {
        return prev;
      }
      const t = Math.max(0, Math.min(1, (targetX - x0) / denom));
      return prev + t * segLen;
    }
  }
  return chordMetrics.total;
}

export function useAreaSegmentHighlight({
  data,
  dataKey,
  tooltipData,
  selection,
  xScale,
  yScale,
  xAccessor,
}: UseAreaSegmentHighlightOptions) {
  const getY = useCallback(
    (d: Record<string, unknown>) => {
      const value = d[dataKey];
      return typeof value === "number" ? (yScale(value) ?? 0) : 0;
    },
    [dataKey, yScale]
  );

  const chordMetrics = useMemo(
    () => buildChordMetrics(data, getY, xScale, xAccessor),
    [data, getY, xScale, xAccessor]
  );

  const segmentBounds = useMemo(() => {
    if (data.length < 2 || chordMetrics.total <= 0) {
      return { startLength: 0, segmentLength: 0, isActive: false };
    }

    if (selection?.active) {
      const startLength = approximateLengthAtX(
        selection.startX,
        data,
        chordMetrics,
        xScale,
        xAccessor
      );
      const endLength = approximateLengthAtX(
        selection.endX,
        data,
        chordMetrics,
        xScale,
        xAccessor
      );
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
    const startIdx = Math.max(0, idx - 1);
    const endIdx = Math.min(data.length - 1, idx + 1);
    const startPoint = data[startIdx];
    const endPoint = data[endIdx];
    if (!(startPoint && endPoint)) {
      return { startLength: 0, segmentLength: 0, isActive: false };
    }

    const startX = xScale(xAccessor(startPoint)) ?? 0;
    const endX = xScale(xAccessor(endPoint)) ?? 0;
    const startLength = approximateLengthAtX(
      startX,
      data,
      chordMetrics,
      xScale,
      xAccessor
    );
    const endLength = approximateLengthAtX(
      endX,
      data,
      chordMetrics,
      xScale,
      xAccessor
    );

    return {
      startLength,
      segmentLength: Math.max(0, endLength - startLength),
      isActive: true,
    };
  }, [tooltipData, selection, data, xScale, xAccessor, chordMetrics]);

  return { chordMetrics, segmentBounds, getY };
}
