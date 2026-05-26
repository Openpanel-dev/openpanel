"use client";

import { curveNatural } from "@visx/curve";
import { LinePath } from "@visx/shape";

// CurveFactory type - simplified version compatible with visx
// biome-ignore lint/suspicious/noExplicitAny: d3 curve factory type
type CurveFactory = any;

import { motion, useMotionTemplate, useSpring } from "motion/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { chartCssVars, useChart } from "./chart-context";
import { ChartRevealClip } from "./chart-reveal-clip";
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
}

export function Line({
  dataKey,
  stroke = chartCssVars.linePrimary,
  strokeWidth = 2.5,
  curve = curveNatural,
  animate = true,
  fadeEdges = true,
  showHighlight = true,
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
  const [pathLength, setPathLength] = useState(0);
  // Cache the `d` attribute as state so the highlight `motion.path` reads a
  // stable string ref instead of a DOM attribute on every render.
  const [pathD, setPathD] = useState<string | null>(null);

  // `useId()` is SSR-stable and skips per-render `Math.random()` / base36 work.
  const reactId = useId();
  const gradientId = `line-gradient-${dataKey}-${reactId}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: data, innerWidth
  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const len = path.getTotalLength();
    if (len > 0) setPathLength(len);
    const d = path.getAttribute("d");
    if (d) setPathD(d);
  }, [data, innerWidth, yScale]);

  // Chord-length based highlight bounds — no `getPointAtLength` binary search
  // per hover. Memoized on (data, scales, dataKey); subsequent hovers are
  // O(1) lookups instead of ~30-60 SVG DOM ops per Line.
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

  // Springs for smooth highlight animation (both offset AND segment length).
  // High stiffness so they snap near-instantly between data buckets.
  const springConfig = { stiffness: 1000, damping: 60 };
  const offsetSpring = useSpring(0, springConfig);
  const segmentLengthSpring = useSpring(0, springConfig);

  // Set spring targets directly in render — motion schedules its own animation
  // frame internally and doesn't trigger a React re-render. The effect-based
  // version cost a double render per hover update.
  offsetSpring.set(-segmentBounds.startLength);
  segmentLengthSpring.set(segmentBounds.segmentLength);

  const animatedDasharray = useMotionTemplate`${segmentLengthSpring} ${pathLength}`;

  const getY = useCallback(
    (d: Record<string, unknown>) => {
      const value = d[dataKey];
      return typeof value === "number" ? (yScale(value) ?? 0) : 0;
    },
    [dataKey, yScale]
  );

  const isHovering = tooltipData !== null || selection?.active === true;

  return (
    <>
      {/* Gradient definition for fading edges */}
      {fadeEdges && (
        <defs>
          <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" style={{ stopColor: stroke, stopOpacity: 0 }} />
            <stop offset="15%" style={{ stopColor: stroke, stopOpacity: 1 }} />
            <stop offset="85%" style={{ stopColor: stroke, stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: stroke, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
      )}

      {/* Clip path for grow animation - unique per line */}
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
            innerRef={pathRef}
            stroke={fadeEdges ? `url(#${gradientId})` : stroke}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
            x={(d) => xScale(xAccessor(d)) ?? 0}
            y={getY}
          />
        </motion.g>
      </g>

      {/* Highlight segment on hover — reads cached pathD instead of doing a
          DOM attribute read on every render. */}
      {showHighlight && isHovering && isLoaded && pathD && (
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
      )}
    </>
  );
}

Line.displayName = "Line";

export default Line;
