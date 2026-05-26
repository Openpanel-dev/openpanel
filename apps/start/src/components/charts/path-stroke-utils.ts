import { type RefObject, useEffect, useState } from "react";

export function findPathLengthAtX(
  path: SVGPathElement | null,
  pathLength: number,
  targetX: number
): number {
  if (!path || pathLength === 0) {
    return 0;
  }
  let low = 0;
  let high = pathLength;
  const tolerance = 0.5;

  while (high - low > tolerance) {
    const mid = (low + high) / 2;
    const point = path.getPointAtLength(mid);
    if (point.x < targetX) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

export function usePathStrokeMetrics(
  pathRef: RefObject<SVGPathElement | null>,
  remeasureKey: string
) {
  const [pathLength, setPathLength] = useState(0);
  const [pathD, setPathD] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: remeasure when series geometry changes
  useEffect(() => {
    const path = pathRef.current;
    if (!path) {
      return;
    }
    const len = path.getTotalLength();
    const d = path.getAttribute("d");
    if (len > 0) {
      setPathLength(len);
    }
    if (d) {
      setPathD(d);
    }
  }, [remeasureKey, pathRef]);

  return { pathLength, pathD };
}

export function resolveDashTailBounds(
  dashFromIndex: number | undefined,
  dataLength: number
): boolean {
  return (
    dashFromIndex != null &&
    dashFromIndex >= 0 &&
    dashFromIndex < dataLength - 1
  );
}

export function resolveDashStartX(
  data: Record<string, unknown>[],
  dashFromIndex: number,
  xScale: (value: Date | number) => number | undefined,
  xAccessor: (datum: Record<string, unknown>) => Date | number
): number {
  const dashFromPoint = data[dashFromIndex];
  if (!dashFromPoint) {
    return 0;
  }
  return xScale(xAccessor(dashFromPoint)) ?? 0;
}
