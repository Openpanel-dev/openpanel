'use client';

import { memo, useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHeatmap } from './heatmap-context';
import {
  buildHeatmapSeparatorGradientStops,
  getHeatmapSeparatorLineY,
  getHeatmapSeparatorX,
  type HeatmapSeparatorGradient,
  type HeatmapSeparatorStrokeStyle,
  resolveHeatmapSeparatorStrokeDasharray,
} from './heatmap-utils';
import { cn } from '@/lib/utils';

/** Marker for reliably identifying {@link HeatmapSeparator} in chart child trees. */
export const HEATMAP_SEPARATOR_MARKER = '__isHeatmapSeparator' as const;

export interface HeatmapSeparatorProps {
  /**
   * Insert a separator before every Nth column (e.g. 4 = divide every four weeks).
   * Used when `groupBy="every"`. When omitted, uses `columnSeparators` from
   * {@link HeatmapChart} or a sibling {@link HeatmapSeparator} parsed for layout.
   */
  every?: number;
  /**
   * Group columns by fixed interval (`every`) or calendar quarter (`quarter`).
   * Default: `"every"`.
   */
  groupBy?: 'every' | 'quarter';
  /** Additional class name for each separator group. */
  className?: string;
  /**
   * Extra horizontal gap between column groups in pixels (shifts cells apart).
   * Parsed from this component by {@link HeatmapChart} for layout. Default: 0
   */
  spacing?: number;
  /** Half-width of the line band in pixels (line is centered). Default: 0 */
  paddingX?: number;
  /** Inset from the bottom of the plot in pixels. Default: 0 */
  paddingY?: number;
  /**
   * Distance from the chart container top to the line start, in pixels.
   * Use to align with {@link HeatmapXAxis} labels (e.g. `14`). The line always
   * extends to the plot bottom. Default: plot top (`margin.top`).
   */
  startOffset?: number;
  /**
   * Distance below the separator line top to place quarter labels.
   * `0` aligns labels with the line top. Default: 0.
   */
  labelOffset?: number;
  /** Draw Q1–Q4 labels at the start of each quarter group. Default: false */
  showLabels?: boolean;
  /** Format quarter group labels. Default: `Q{n}` */
  labelFormat?: (quarter: number, startDate: Date) => string;
  /** Additional class name for quarter labels */
  labelClassName?: string;
  /** Solid or dashed separator line. Default: `"solid"` */
  strokeStyle?: HeatmapSeparatorStrokeStyle;
  /** Dash pattern when `strokeStyle="dashed"`. Default: `"4,4"` */
  strokeDasharray?: string;
  /** Line stroke color when `gradient` is omitted. Default: `var(--border)` */
  stroke?: string;
  /**
   * Vertical stroke gradient aligned to each line's span.
   * Use matching `from`/`via`/`to` colors with fading opacities to soften the
   * top and bottom (e.g. `{ fromOpacity: 0, viaOpacity: 1, toOpacity: 0 }`).
   */
  gradient?: HeatmapSeparatorGradient;
  /** Line stroke width in pixels. Default: 1 */
  strokeWidth?: number;
  /** Multiplier applied to solid strokes or gradient stop opacities. Default: 1 */
  strokeOpacity?: number;
}

export const HeatmapSeparator = memo(function HeatmapSeparator({
  className,
  paddingX = 0,
  paddingY = 0,
  startOffset,
  labelOffset = 0,
  showLabels = false,
  labelFormat = (quarter) => `Q${quarter}`,
  labelClassName,
  strokeStyle = 'solid',
  strokeDasharray,
  stroke = 'var(--border)',
  gradient,
  strokeWidth = 1,
  strokeOpacity = 1,
}: HeatmapSeparatorProps) {
  const { gap, innerHeight, margin, separatorLayout, xScale, containerRef } =
    useHeatmap();

  const [mounted, setMounted] = useState(false);
  const reactId = useId().replace(/:/g, '');
  const gradientId = `heatmap-separator-gradient-${reactId}`;

  useEffect(() => {
    setMounted(true);
  }, []);

  const separators = useMemo(() => {
    if (!separatorLayout) {
      return [];
    }

    return separatorLayout.atColumns.map((columnIndex) => ({
      columnIndex,
      x: getHeatmapSeparatorX(columnIndex, gap, separatorLayout, xScale),
    }));
  }, [gap, separatorLayout, xScale]);

  const labels = useMemo(() => {
    if (!(showLabels && separatorLayout?.groups.length)) {
      return [];
    }

    return separatorLayout.groups.map((group) => ({
      key: `${group.year}-Q${group.quarter}-${group.startColumnIndex}`,
      label: labelFormat(group.quarter, group.startDate),
      x: margin.left + xScale(group.startColumnIndex),
    }));
  }, [labelFormat, margin.left, separatorLayout, showLabels, xScale]);

  if (!separatorLayout) {
    return null;
  }

  const { y1: lineY1, y2: lineY2 } = getHeatmapSeparatorLineY({
    innerHeight,
    marginTop: margin.top,
    startOffset,
    paddingY,
  });

  const separatorTop = startOffset ?? margin.top;
  const labelTop = separatorTop + labelOffset;
  const resolvedStroke = gradient ? `url(#${gradientId})` : stroke;
  const resolvedStrokeDasharray = resolveHeatmapSeparatorStrokeDasharray(
    strokeStyle,
    strokeDasharray
  );
  const gradientStops = gradient
    ? buildHeatmapSeparatorGradientStops(gradient, strokeOpacity)
    : null;

  const container = containerRef.current;
  const labelPortal =
    mounted && container && labels.length > 0
      ? createPortal(
          labels.map((tick) => (
            <div
              className="pointer-events-none absolute"
              key={tick.key}
              style={{
                top: labelTop,
                left: tick.x,
                width: 0,
                display: 'flex',
                justifyContent: 'flex-start',
              }}
            >
              <span
                className={cn(
                  'whitespace-nowrap text-chart-label text-xs',
                  labelClassName
                )}
              >
                {tick.label}
              </span>
            </div>
          )),
          container
        )
      : null;

  if (separators.length === 0) {
    return labelPortal;
  }

  return (
    <>
      {gradientStops ? (
        <defs>
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={gradientId}
            x1={0}
            x2={0}
            y1={lineY1}
            y2={lineY2}
          >
            {gradientStops.map((stop) => (
              <stop
                key={stop.offset}
                offset={stop.offset}
                stopColor={stop.color}
                stopOpacity={stop.opacity}
              />
            ))}
          </linearGradient>
        </defs>
      ) : null}
      <g>
        {separators.map((separator) => (
          <g
            className={cn(className)}
            key={separator.columnIndex}
            transform={`translate(${separator.x}, 0)`}
          >
            {paddingX > 0 ? (
              <rect
                fill="transparent"
                height={lineY2 - lineY1}
                width={paddingX * 2}
                x={-paddingX}
                y={lineY1}
              />
            ) : null}
            <line
              stroke={resolvedStroke}
              strokeDasharray={resolvedStrokeDasharray}
              strokeOpacity={gradient ? undefined : strokeOpacity}
              strokeWidth={strokeWidth}
              x1={0}
              x2={0}
              y1={lineY1}
              y2={lineY2}
            />
          </g>
        ))}
      </g>
      {labelPortal}
    </>
  );
});

(HeatmapSeparator as unknown as Record<string, boolean>)[
  HEATMAP_SEPARATOR_MARKER
] = true;

HeatmapSeparator.displayName = 'HeatmapSeparator';

export default HeatmapSeparator;
