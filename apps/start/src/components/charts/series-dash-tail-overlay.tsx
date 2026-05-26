"use client";

import type { RefObject } from "react";
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

export function SeriesDashTailOverlay({
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
}
