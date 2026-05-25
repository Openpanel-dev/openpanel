"use client";

import { curveNatural } from "@visx/curve";
import { LinePath } from "@visx/shape";

// CurveFactory type - simplified version compatible with visx
// biome-ignore lint/suspicious/noExplicitAny: d3 curve factory type
type CurveFactory = any;

import { motion, useMotionTemplate, useSpring } from "motion/react";
import { useCallback, useId, useRef } from "react";
import { chartCssVars, useChart } from "./chart-context";
import { ChartRevealClip } from "./chart-reveal-clip";
import {
  resolveDashTailBounds,
  usePathStrokeMetrics,
} from "./path-stroke-utils";
import { SeriesDashTailOverlay } from "./series-dash-tail-overlay";
import { SeriesMarkers } from "./series-markers";
import type { SeriesPointMarkerStyle } from "./series-point-marker";
import { useLineSegmentHighlight } from "./use-line-segment-highlight";

export interface LineProps {
  /** Key in data to use for y values */
  dataKey: string;
  /** Stroke color. Default: var(--chart-line-primary) */
  stroke?: string;
  /** Stroke width. Default: 2.5 */
  strokeWidth?: number;
  /** Curve function. Default: curveNatural */
  curve?: CurveFactory;
  /** Whether to animate the line. Default: true */
  animate?: boolean;
  /** Whether to fade edges with gradient. Default: true */
  fadeEdges?: boolean;
  /** Whether to show highlight segment on hover. Default: true */
  showHighlight?: boolean;
  /** Render scatter-style circle markers at each data point. Default: false */
  showMarkers?: boolean;
  /** Marker styling (same options as Scatter). */
  markers?: SeriesPointMarkerStyle;
  /**
   * Data index from which the line stroke becomes dashed (inclusive).
   * Useful for projecting incomplete periods, e.g. dashed from yesterday through today.
   */
  dashFromIndex?: number;
  /** Dash pattern for the tail segment when `dashFromIndex` is set. Default: "6,4" */
  dashArray?: string;
}

export function Line({
  dataKey,
  stroke = chartCssVars.linePrimary,
  strokeWidth = 2.5,
  curve = curveNatural,
  animate = true,
  fadeEdges = true,
  showHighlight = true,
  showMarkers = false,
  markers,
  dashFromIndex,
  dashArray = "6,4",
}: LineProps) {
  const {
    data,
    xScale,
    yScale,
    innerHeight,
    innerWidth,
    tooltipData,
    selection,
    isLoaded,
    enterTransition,
    revealEpoch,
    xAccessor,
  } = useChart();

  const pathRef = useRef<SVGPathElement>(null);
  const pathMetricsKey = `${data.length}:${innerWidth}:${dashFromIndex}:${animate}`;
  const { pathLength, pathD } = usePathStrokeMetrics(pathRef, pathMetricsKey);

  // `useId()` gives an SSR-stable string and skips per-render `Math.random()`
  // / base36 work that previously violated render purity.
  const reactId = useId();
  const gradientId = `line-gradient-${dataKey}-${reactId}`;

  const segmentBounds = useLineSegmentHighlight({
    pathLength,
    data,
    tooltipData,
    selection,
    xScale,
    yScale,
    xAccessor,
    dataKey,
  });

  const getY = useCallback(
    (d: Record<string, unknown>) => {
      const value = d[dataKey];
      if (typeof value === "number") {
        return yScale(value) ?? yScale(0) ?? 0;
      }
      // Missing value: fall back to the baseline (y of 0), NOT raw 0 which is
      // SVG-top — see bklit-issues.md. Combined with `isDefined` below, the
      // line breaks at missing points rather than drawing to baseline.
      return yScale(0) ?? 0;
    },
    [dataKey, yScale]
  );

  // Break the path at undefined / non-numeric values. Without this, the line
  // would drop to baseline at missing points and create stray "tick"
  // artifacts at chart edges where prev-period data is unavailable.
  const isDefined = useCallback(
    (d: Record<string, unknown>) => typeof d[dataKey] === "number",
    [dataKey]
  );

  const isHovering = tooltipData !== null || selection?.active === true;
  const hasDashTail = resolveDashTailBounds(dashFromIndex, data.length);
  const lineStroke = fadeEdges ? `url(#${gradientId})` : stroke;

  return (
    <>
      {fadeEdges ? (
        <defs>
          <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" style={{ stopColor: stroke, stopOpacity: 0 }} />
            <stop offset="15%" style={{ stopColor: stroke, stopOpacity: 1 }} />
            <stop offset="85%" style={{ stopColor: stroke, stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: stroke, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
      ) : null}

      {animate && data.length > 1 ? (
        <defs>
          <ChartRevealClip
            clipPathId={`grow-clip-${dataKey}`}
            enterTransition={enterTransition}
            height={innerHeight + 20}
            revealEpoch={revealEpoch ?? 0}
            targetWidth={innerWidth}
          />
        </defs>
      ) : null}

      <g
        clipPath={
          animate && data.length > 1 ? `url(#grow-clip-${dataKey})` : undefined
        }
      >
        <motion.g
          animate={{ opacity: isHovering && showHighlight ? 0.3 : 1 }}
          initial={{ opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        >
          <LinePath
            curve={curve}
            data={data}
            defined={isDefined}
            innerRef={pathRef}
            stroke={hasDashTail ? "transparent" : lineStroke}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
            x={(d) => xScale(xAccessor(d)) ?? 0}
            y={getY}
          />

          <SeriesDashTailOverlay
            dashArray={dashArray}
            dashFromIndex={dashFromIndex}
            data={data}
            innerHeight={innerHeight}
            innerWidth={innerWidth}
            pathD={pathD}
            pathLength={pathLength}
            pathRef={pathRef}
            stroke={lineStroke}
            strokeWidth={strokeWidth}
            xAccessor={xAccessor}
            xScale={xScale}
          />
        </motion.g>
      </g>

      {showMarkers ? (
        <SeriesMarkers
          animate={animate}
          dataKey={dataKey}
          {...markers}
          fill={markers?.fill ?? stroke}
          stroke={markers?.stroke ?? markers?.fill ?? stroke}
        />
      ) : null}

      {showHighlight && isHovering && isLoaded && pathRef.current ? (
        <LineHighlight
          pathD={pathRef.current.getAttribute("d") || ""}
          pathLength={pathLength}
          segmentBounds={segmentBounds}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      ) : null}
    </>
  );
}

const highlightSpringConfig = { stiffness: 1000, damping: 60 };

/**
 * Extracted so its position springs only initialize when the highlight is
 * actually being shown. If the springs lived on `Line` (always mounted),
 * they'd init at `0` and have to animate from the chart's left edge on
 * every first hover — leaving a brief stray highlight stroke at x=0.
 */
function LineHighlight({
  pathD,
  pathLength,
  segmentBounds,
  stroke,
  strokeWidth,
}: {
  pathD: string;
  pathLength: number;
  segmentBounds: { startLength: number; segmentLength: number; isActive: boolean };
  stroke: string;
  strokeWidth: number;
}) {
  const offsetSpring = useSpring(-segmentBounds.startLength, highlightSpringConfig);
  const segmentLengthSpring = useSpring(
    segmentBounds.segmentLength,
    highlightSpringConfig,
  );
  offsetSpring.set(-segmentBounds.startLength);
  segmentLengthSpring.set(segmentBounds.segmentLength);
  const animatedDasharray = useMotionTemplate`${segmentLengthSpring} ${pathLength}`;

  return (
    <motion.path
      animate={{ opacity: 1 }}
      d={pathD}
      exit={{ opacity: 0 }}
      fill="none"
      initial={{ opacity: 0 }}
      stroke={stroke}
      strokeLinecap="round"
      strokeWidth={strokeWidth}
      style={{
        strokeDasharray: animatedDasharray,
        strokeDashoffset: offsetSpring,
      }}
      transition={{ duration: 0.4, ease: "easeInOut" }}
    />
  );
}

Line.displayName = "Line";

export default Line;
