"use client";

import { useCallback, useMemo } from "react";
import {
  clipRevealTransition,
  DEFAULT_CHART_ENTER_TRANSITION,
} from "./animation";
import { defaultScatterColors, useChart } from "./chart-context";
import {
  getSeriesMarkerVisualExtent,
  SeriesPointMarker,
  type SeriesPointMarkerStyle,
} from "./series-point-marker";

export interface SeriesMarkersProps extends SeriesPointMarkerStyle {
  dataKey: string;
  /** Marker fill color. Defaults to series stroke or chart palette color. */
  fill?: string;
  /** Whether to animate markers with clip reveal. Default: true */
  animate?: boolean;
}

export function SeriesMarkers({
  dataKey,
  fill,
  stroke,
  strokeWidth = 2,
  ringGap = 2,
  outlineWidth = 0,
  outlineColor,
  radius = 5,
  animate = true,
  fadeOnHover = true,
  inactiveOpacity = 0.5,
  inactiveBlur = 2,
  enterBlur = 2,
  showActiveHighlight = true,
}: SeriesMarkersProps) {
  const {
    data,
    xScale,
    yScale,
    innerWidth,
    tooltipData,
    enterTransition,
    animationDuration,
    revealEpoch,
    isLoaded,
    xAccessor,
    lines,
  } = useChart();

  const seriesIndex = useMemo(() => {
    const index = lines.findIndex((line) => line.dataKey === dataKey);
    return index >= 0 ? index : 0;
  }, [lines, dataKey]);

  const seriesConfig = lines[seriesIndex];
  const seriesColor =
    defaultScatterColors[seriesIndex % defaultScatterColors.length] ??
    defaultScatterColors[0];

  const resolvedFill = fill ?? seriesConfig?.stroke ?? seriesColor;
  const resolvedStroke = stroke ?? resolvedFill;

  const visualExtent = useMemo(
    () =>
      getSeriesMarkerVisualExtent({
        radius,
        strokeWidth,
        ringGap,
        outlineWidth,
        showActiveHighlight,
      }),
    [radius, strokeWidth, ringGap, outlineWidth, showActiveHighlight]
  );

  const revealDurationSec =
    clipRevealTransition(enterTransition).duration ?? animationDuration / 1000;
  const enterDuration = 0.5;
  const hoverEase = DEFAULT_CHART_ENTER_TRANSITION.ease;
  const isRevealing = animate && !isLoaded;

  const getY = useCallback(
    (d: Record<string, unknown>) => {
      const value = d[dataKey];
      return typeof value === "number" ? (yScale(value) ?? 0) : null;
    },
    [dataKey, yScale]
  );

  const isHovering = tooltipData !== null;
  const activeIndex = tooltipData?.index ?? -1;

  const points = useMemo(
    () =>
      data.flatMap((d, index) => {
        const cy = getY(d);
        if (cy === null) {
          return [];
        }
        const cx = xScale(xAccessor(d)) ?? 0;
        const leadingEdge = Math.max(0, cx - visualExtent);
        const revealDelay =
          innerWidth > 0 && isRevealing
            ? (leadingEdge / innerWidth) * revealDurationSec
            : 0;

        return [{ index, cx, cy, revealDelay }];
      }),
    [
      data,
      getY,
      xScale,
      xAccessor,
      innerWidth,
      isRevealing,
      revealDurationSec,
      visualExtent,
    ]
  );

  return (
    <g>
      {points.map((point) => (
        <SeriesPointMarker
          cx={point.cx}
          cy={point.cy}
          dataKey={dataKey}
          enterBlur={enterBlur}
          enterDuration={enterDuration}
          fadeOnHover={fadeOnHover}
          fill={resolvedFill}
          hoverEase={hoverEase}
          inactiveBlur={inactiveBlur}
          inactiveOpacity={inactiveOpacity}
          index={point.index}
          isActive={activeIndex === point.index}
          isHovering={isHovering}
          key={`${dataKey}-${point.index}`}
          outlineColor={outlineColor}
          outlineWidth={outlineWidth}
          radius={radius}
          revealDelay={point.revealDelay}
          revealEpoch={revealEpoch ?? 0}
          ringGap={ringGap}
          showActiveHighlight={showActiveHighlight}
          stroke={resolvedStroke}
          strokeWidth={strokeWidth}
        />
      ))}
    </g>
  );
}

SeriesMarkers.displayName = "SeriesMarkers";

export default SeriesMarkers;
