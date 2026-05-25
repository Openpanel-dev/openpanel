import { type RefObject, useEffect, useRef, useState } from "react";

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
  // Kept for callsite ergonomics, no longer used as a dep — see comment
  // below. Removing the param would churn every caller for no benefit.
  _remeasureKey?: string,
) {
  const [pathLength, setPathLength] = useState(0);
  const [pathD, setPathD] = useState<string | null>(null);
  const pathLengthRef = useRef(0);
  const pathDRef = useRef<string | null>(null);

  // Runs after every Line/Area render. Necessary because content-only
  // changes (e.g. a filter that swaps values but keeps the bucket count)
  // don't show up in any deterministic key — the old key-based remeasure
  // would skip and leave `pathD` / `pathLength` stale, so SeriesDashTailOverlay
  // drew the previous data's path shape after a filter remove. The ref
  // comparison early-returns when nothing changed, so this is cheap
  // outside of actual geometry updates.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional every-render measure
  useEffect(() => {
    const path = pathRef.current;
    if (!path) {
      return;
    }
    const newD = path.getAttribute("d");
    if (newD && newD !== pathDRef.current) {
      pathDRef.current = newD;
      setPathD(newD);
    }
    const newLen = path.getTotalLength();
    if (newLen > 0 && newLen !== pathLengthRef.current) {
      pathLengthRef.current = newLen;
      setPathLength(newLen);
    }
  });

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
