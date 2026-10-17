// biome-ignore-all lint/correctness/useExhaustiveDependencies: usePathStrokeMetrics intentionally accepts caller-controlled deps
import { type RefObject, useEffect, useState } from 'react';

interface PathStrokeMetrics {
  pathD: string | null;
  pathLength: number;
}

const EMPTY_METRICS: PathStrokeMetrics = { pathD: null, pathLength: 0 };

/**
 * Caller passes the references that drive the rendered path (renderData,
 * innerWidth, etc.) as `deps`. A stringified summary like
 * `${renderData.length}:${innerWidth}` is *not* safe here — same-length
 * in-place mutations of `renderData` keep the summary identical, so the
 * effect would never re-fire and `pathD`/`pathLength` would stay frozen on
 * the previous geometry (the area fill repaints from `renderData` directly
 * and would diverge from the stroke). The y-scale belongs in `deps` too: it
 * is rebuilt on every frame of the y-domain tween and on height changes, and
 * the dashed-tail stroke is drawn from the measured `pathD`, so a stale
 * measurement leaves the stroke behind while the fill follows the scale.
 */
export function usePathStrokeMetrics(
  pathRef: RefObject<SVGPathElement | null>,
  deps: readonly unknown[]
): PathStrokeMetrics {
  const [metrics, setMetrics] = useState<PathStrokeMetrics>(EMPTY_METRICS);

  useEffect(() => {
    const path = pathRef.current;
    if (!path) {
      return;
    }
    const d = path.getAttribute('d');
    const len = d ? path.getTotalLength() : 0;
    setMetrics((prev) =>
      prev.pathD === d && prev.pathLength === len
        ? prev
        : { pathD: d, pathLength: len }
    );
  }, deps);

  return metrics;
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
