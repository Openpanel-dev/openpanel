"use client";

import { useCallback, useMemo } from "react";
import { clipRevealTransition } from "./animation";
import { defaultScatterColors, useChart } from "./chart-context";
import {
  getSeriesMarkerVisualExtent,
  SeriesPointMarker,
  type SeriesPointMarkerStyle,
  StaticSeriesPointMarker,
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

  const markerStyle = {
    fill: resolvedFill,
    stroke: resolvedStroke,
    strokeWidth,
    ringGap,
    outlineWidth,
    outlineColor,
    radius,
  };

  if (isRevealing) {
    return (
      <g>
        {points.map((point) => (
          <SeriesPointMarker
            cx={point.cx}
            cy={point.cy}
            dataKey={dataKey}
            enterBlur={enterBlur}
            enterDuration={enterDuration}
            index={point.index}
            key={`${dataKey}-${point.index}`}
            revealDelay={point.revealDelay}
            revealEpoch={revealEpoch ?? 0}
            {...markerStyle}
          />
        ))}
      </g>
    );
  }

  const dimBase = fadeOnHover && isHovering;
  const activePoint = dimBase
    ? points.find((point) => point.index === activeIndex)
    : null;
  const activeScale = showActiveHighlight ? 1.35 : 1;

  return (
    <g>
      <g
        opacity={dimBase ? inactiveOpacity : 1}
        style={{
          transition: "opacity 0.15s ease-in-out, filter 0.15s ease-in-out",
          filter:
            dimBase && inactiveBlur > 0 ? `blur(${inactiveBlur}px)` : "none",
        }}
      >
        {points.map((point) => (
          <StaticSeriesPointMarker
            cx={point.cx}
            cy={point.cy}
            key={`${dataKey}-${point.index}`}
            {...markerStyle}
          />
        ))}
      </g>
      {activePoint ? (
        <StaticSeriesPointMarker
          cx={activePoint.cx}
          cy={activePoint.cy}
          scale={activeScale}
          {...markerStyle}
        />
      ) : null}
    </g>
  );
}

SeriesMarkers.displayName = "SeriesMarkers";

export default SeriesMarkers;
