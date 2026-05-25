"use client";

import { memo, type RefObject } from "react";
import { DashTailStroke } from "./dash-tail-stroke";
import {
  findPathLengthAtX,
  resolveDashStartX,
  resolveDashTailBounds,
} from "./path-stroke-utils";

interface SeriesDashTailOverlayProps {
  dashFromIndex?: number;
  dashArray: string;
  data: Record<string, unknown>[];
  pathD: string | null;
  pathLength: number;
  pathRef: RefObject<SVGPathElement | null>;
  innerWidth: number;
  innerHeight: number;
  stroke: string;
  strokeWidth: number;
  xScale: (value: Date | number) => number | undefined;
  xAccessor: (datum: Record<string, unknown>) => Date | number;
}

/**
 * Wrapped in `memo` because the binary-search `findPathLengthAtX` inside is
 * ~30-60 `getPointAtLength` DOM calls and was profiling at 70+ms on dense
 * datasets. All inputs are stable on hover (data, pathLength, scales,
 * dashFromIndex), so shallow-comparing props lets Area's per-bucket re-render
 * skip this entire subtree.
 */
export const SeriesDashTailOverlay = memo(function SeriesDashTailOverlay({
  dashFromIndex,
  dashArray,
  data,
  pathD,
  pathLength,
  pathRef,
  innerWidth,
  innerHeight,
  stroke,
  strokeWidth,
  xScale,
  xAccessor,
}: SeriesDashTailOverlayProps) {
  const hasDashTail = resolveDashTailBounds(dashFromIndex, data.length);
  if (!hasDashTail || dashFromIndex == null || pathLength <= 0) {
    return null;
  }

  const dashStartX = resolveDashStartX(data, dashFromIndex, xScale, xAccessor);
  const dashStartLength = findPathLengthAtX(
    pathRef.current,
    pathLength,
    dashStartX
  );

  return (
    <DashTailStroke
      dashArray={dashArray}
      dashStartLength={dashStartLength}
      dashStartX={dashStartX}
      innerHeight={innerHeight}
      innerWidth={innerWidth}
      pathD={pathD}
      pathLength={pathLength}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );
});
