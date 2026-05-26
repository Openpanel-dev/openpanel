"use client";

import { curveMonotoneX } from "@visx/curve";
import { AreaClosed, LinePath } from "@visx/shape";

// CurveFactory type - simplified version compatible with visx
// biome-ignore lint/suspicious/noExplicitAny: d3 curve factory type
type CurveFactory = any;

import { motion } from "motion/react";
import { useCallback, useId, useRef } from "react";
import { AreaGradientDefs } from "./area-gradient-defs";
import { chartCssVars, useChart } from "./chart-context";
import { ChartRevealClip } from "./chart-reveal-clip";
import { HighlightSegment } from "./highlight-segment";
import {
  resolveDashTailBounds,
  usePathStrokeMetrics,
} from "./path-stroke-utils";
import { SeriesDashTailOverlay } from "./series-dash-tail-overlay";
import { SeriesMarkers } from "./series-markers";
import type { SeriesPointMarkerStyle } from "./series-point-marker";
import { useHighlightSegment } from "./use-highlight-segment";

export interface AreaProps {
  /** Key in data to use for y values */
  dataKey: string;
  /** Fill color for the area gradient start. Default: var(--chart-line-primary) */
  fill?: string;
  /** Fill opacity at the top of the area. Default: 0.4 */
  fillOpacity?: number;
  /** Stroke color for the line. Default: same as fill */
  stroke?: string;
  /** Stroke width. Default: 2 */
  strokeWidth?: number;
  /** Curve function. Default: curveMonotoneX */
  curve?: CurveFactory;
  /** Whether to animate the area. Default: true */
  animate?: boolean;
  /** Whether to show the stroke line. Default: true */
  showLine?: boolean;
  /** Whether to show highlight segment on hover. Default: true */
  showHighlight?: boolean;
  /** Gradient opacity at bottom (0 = fully transparent). Default: 0 */
  gradientToOpacity?: number;
  /** Whether to fade the area fill at left/right edges. Default: false */
  fadeEdges?: boolean;
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: gradient defs and fill/stroke layers share one composable entry point
export function Area({
  dataKey,
  fill = chartCssVars.linePrimary,
  fillOpacity = 0.4,
  stroke,
  strokeWidth = 2,
  curve = curveMonotoneX,
  animate = true,
  showLine = true,
  showHighlight = true,
  gradientToOpacity = 0,
  fadeEdges = false,
  showMarkers = false,
  markers,
  dashFromIndex,
  dashArray = "6,4",
}: AreaProps) {
  const {
    data,
    renderData,
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
  const pathMetricsKey = `${renderData.length}:${innerWidth}:${dashFromIndex}:${showLine}`;
  const { pathLength, pathD } = usePathStrokeMetrics(pathRef, pathMetricsKey);

  // Unique IDs for this area
  const uniqueId = useId();
  const gradientId = `area-gradient-${dataKey}-${uniqueId}`;
  const strokeGradientId = `area-stroke-gradient-${dataKey}-${uniqueId}`;
  const edgeMaskId = `area-edge-mask-${dataKey}-${uniqueId}`;
  const edgeGradientId = `${edgeMaskId}-gradient`;
  const revealClipId = `grow-clip-area-${dataKey}-${uniqueId}`;
  const useRevealClip = animate && renderData.length > 1 && innerWidth > 0;

  const isPatternFill = fill.startsWith("url(");
  const showAreaFill = isPatternFill || fillOpacity > 0;
  const areaFill = isPatternFill ? fill : `url(#${gradientId})`;

  // Resolved stroke color (defaults to fill; pattern URLs need a real color)
  const resolvedStroke =
    stroke || (isPatternFill ? chartCssVars.linePrimary : fill);

  const getY = useCallback(
    (d: Record<string, unknown>) => {
      const value = d[dataKey];
      return typeof value === "number" ? (yScale(value) ?? 0) : 0;
    },
    [dataKey, yScale]
  );

  // Hover-highlight band via the shared hook. Disabled when there is no stroke
  // to highlight (showLine={false}) or the highlight is off.
  const { xSpring, widthSpring, isActive } = useHighlightSegment({
    enabled: showHighlight && showLine,
  });

  const isHovering = tooltipData !== null || selection?.active === true;
  const hasDashTail = resolveDashTailBounds(dashFromIndex, data.length);
  const strokePaint = `url(#${strokeGradientId})`;

  return (
    <>
      <AreaGradientDefs
        edgeGradientId={edgeGradientId}
        edgeMaskId={edgeMaskId}
        fadeEdges={fadeEdges}
        fill={fill}
        fillOpacity={fillOpacity}
        gradientId={gradientId}
        gradientToOpacity={gradientToOpacity}
        innerHeight={innerHeight}
        innerWidth={innerWidth}
        isPatternFill={isPatternFill}
        resolvedStroke={resolvedStroke}
        strokeGradientId={strokeGradientId}
      />

      {/* Clip path for grow animation - unique per area */}
      {useRevealClip ? (
        <defs>
          <ChartRevealClip
            clipPathId={revealClipId}
            enterTransition={enterTransition}
            height={innerHeight + 20}
            revealEpoch={revealEpoch ?? 0}
            targetWidth={innerWidth}
          />
        </defs>
      ) : null}

      {/* Main area with clip path */}
      <g clipPath={useRevealClip ? `url(#${revealClipId})` : undefined}>
        <motion.g
          animate={{ opacity: isHovering && showHighlight ? 0.6 : 1 }}
          initial={{ opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        >
          {/* Area fill */}
          {showAreaFill ? (
            <g
              mask={
                fadeEdges && !isPatternFill ? `url(#${edgeMaskId})` : undefined
              }
            >
              <AreaClosed
                curve={curve}
                data={renderData}
                fill={areaFill}
                x={(d) => xScale(xAccessor(d)) ?? 0}
                y={getY}
                yScale={yScale}
              />
            </g>
          ) : null}

          {/* Stroke line on top of area */}
          {showLine ? (
            <>
              <LinePath
                curve={curve}
                data={renderData}
                innerRef={pathRef}
                stroke={hasDashTail ? "transparent" : strokePaint}
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
                stroke={strokePaint}
                strokeWidth={strokeWidth}
                xAccessor={xAccessor}
                xScale={xScale}
              />
            </>
          ) : null}
        </motion.g>
      </g>

      {/* Highlight segment on hover */}
      <HighlightSegment
        height={innerHeight}
        pathRef={pathRef}
        stroke={resolvedStroke}
        strokeWidth={strokeWidth}
        visible={showHighlight && showLine && isActive && isLoaded}
        width={widthSpring}
        x={xSpring}
      />

      {showMarkers ? (
        <SeriesMarkers
          animate={animate}
          dataKey={dataKey}
          {...markers}
          fill={markers?.fill ?? resolvedStroke}
          stroke={markers?.stroke ?? markers?.fill ?? resolvedStroke}
        />
      ) : null}
    </>
  );
}

Area.displayName = "Area";

export default Area;
