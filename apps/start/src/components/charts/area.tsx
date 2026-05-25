"use client";

import { curveMonotoneX } from "@visx/curve";
import { AreaClosed, LinePath } from "@visx/shape";

// CurveFactory type - simplified version compatible with visx
// biome-ignore lint/suspicious/noExplicitAny: d3 curve factory type
type CurveFactory = any;

import { motion, useMotionTemplate, useSpring } from "motion/react";
import { useCallback, useId, useMemo, useRef } from "react";
import { chartCssVars, useChart } from "./chart-context";
import { ChartRevealClip } from "./chart-reveal-clip";

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
}

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
}: AreaProps) {
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

  // Unique IDs for this area
  const uniqueId = useId();
  const gradientId = useMemo(
    () => `area-gradient-${dataKey}-${Math.random().toString(36).slice(2, 9)}`,
    [dataKey]
  );
  const strokeGradientId = useMemo(
    () =>
      `area-stroke-gradient-${dataKey}-${Math.random().toString(36).slice(2, 9)}`,
    [dataKey]
  );
  const edgeMaskId = `area-edge-mask-${dataKey}-${uniqueId}`;
  const edgeGradientId = `${edgeMaskId}-gradient`;
  const revealClipId = `grow-clip-area-${dataKey}-${uniqueId}`;
  const useRevealClip = animate && data.length > 1 && innerWidth > 0;

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

  /** Polyline chord lengths along data order (no DOM); used for highlight dash math */
  const chordMetrics = useMemo(() => {
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
  }, [data, xScale, xAccessor, getY]);

  const approximateLengthAtX = useCallback(
    (targetX: number) => {
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
    },
    [data, xScale, xAccessor, chordMetrics]
  );

  // Calculate segment bounds for highlight from either selection or hover
  const segmentBounds = useMemo(() => {
    if (data.length < 2 || chordMetrics.total <= 0) {
      return { startLength: 0, segmentLength: 0, isActive: false };
    }

    if (selection?.active) {
      const startLength = approximateLengthAtX(selection.startX);
      const endLength = approximateLengthAtX(selection.endX);
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

    const startLength = approximateLengthAtX(startX);
    const endLength = approximateLengthAtX(endX);

    return {
      startLength,
      segmentLength: Math.max(0, endLength - startLength),
      isActive: true,
    };
  }, [
    tooltipData,
    selection,
    data,
    xScale,
    xAccessor,
    chordMetrics.total,
    approximateLengthAtX,
  ]);

  // Springs for smooth highlight animation (both offset AND segment length)
  const springConfig = { stiffness: 180, damping: 28 };
  const offsetSpring = useSpring(0, springConfig);
  const segmentLengthSpring = useSpring(0, springConfig);

  offsetSpring.set(-segmentBounds.startLength);
  segmentLengthSpring.set(segmentBounds.segmentLength);

  // Create animated strokeDasharray using motion template
  const animatedDasharray = useMotionTemplate`${segmentLengthSpring} ${chordMetrics.total}`;

  const isHovering = tooltipData !== null || selection?.active === true;

  return (
    <>
      {/* Gradient definitions (pattern fills use fill directly) */}
      <defs>
        {!isPatternFill && (
          <linearGradient id={gradientId} x1="0%" x2="0%" y1="0%" y2="100%">
            <stop
              offset="0%"
              style={{ stopColor: fill, stopOpacity: fillOpacity }}
            />
            <stop
              offset="100%"
              style={{ stopColor: fill, stopOpacity: gradientToOpacity }}
            />
          </linearGradient>
        )}

        <linearGradient id={strokeGradientId} x1="0%" x2="100%" y1="0%" y2="0%">
          <stop
            offset="0%"
            style={{ stopColor: resolvedStroke, stopOpacity: 0 }}
          />
          <stop
            offset="15%"
            style={{ stopColor: resolvedStroke, stopOpacity: 1 }}
          />
          <stop
            offset="85%"
            style={{ stopColor: resolvedStroke, stopOpacity: 1 }}
          />
          <stop
            offset="100%"
            style={{ stopColor: resolvedStroke, stopOpacity: 0 }}
          />
        </linearGradient>

        {fadeEdges && !isPatternFill && (
          <>
            <linearGradient
              id={edgeGradientId}
              x1="0%"
              x2="100%"
              y1="0%"
              y2="0%"
            >
              <stop
                offset="0%"
                style={{ stopColor: "white", stopOpacity: 0 }}
              />
              <stop
                offset="20%"
                style={{ stopColor: "white", stopOpacity: 1 }}
              />
              <stop
                offset="80%"
                style={{ stopColor: "white", stopOpacity: 1 }}
              />
              <stop
                offset="100%"
                style={{ stopColor: "white", stopOpacity: 0 }}
              />
            </linearGradient>
            <mask id={edgeMaskId}>
              <rect
                fill={`url(#${edgeGradientId})`}
                height={innerHeight}
                width={innerWidth}
                x="0"
                y="0"
              />
            </mask>
          </>
        )}
      </defs>

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
                data={data}
                fill={areaFill}
                x={(d) => xScale(xAccessor(d)) ?? 0}
                y={getY}
                yScale={yScale}
              />
            </g>
          ) : null}

          {/* Stroke line on top of area */}
          {showLine && (
            <LinePath
              curve={curve}
              data={data}
              innerRef={pathRef}
              stroke={`url(#${strokeGradientId})`}
              strokeLinecap="round"
              strokeWidth={strokeWidth}
              x={(d) => xScale(xAccessor(d)) ?? 0}
              y={getY}
            />
          )}
        </motion.g>
      </g>

      {/* Highlight segment on hover */}
      {showHighlight &&
        showLine &&
        isHovering &&
        isLoaded &&
        pathRef.current && (
          <motion.path
            animate={{ opacity: 1 }}
            d={pathRef.current.getAttribute("d") || ""}
            exit={{ opacity: 0 }}
            fill="none"
            initial={{ opacity: 0 }}
            stroke={resolvedStroke}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
            style={{
              strokeDasharray: animatedDasharray,
              strokeDashoffset: offsetSpring,
            }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          />
        )}
    </>
  );
}

Area.displayName = "Area";

export default Area;
