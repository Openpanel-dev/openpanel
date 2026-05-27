'use client';

import { memo, type ReactNode, useCallback, useMemo } from 'react';
import {
  type TooltipData,
  useChartHover,
  useChartStable,
} from './chart-context';
import { type ChartMarker, MarkerGroup } from './markers/marker-group';

export interface OPMarkerItem {
  date: Date | string;
  icon: ReactNode;
  title: string;
  description?: string;
  content?: ReactNode;
  color?: string;
  onClick?: () => void;
  href?: string;
  target?: '_blank' | '_self';
}

/**
 * A group of related markers that render together. Single-item clusters are
 * just one marker; multi-item clusters get a count badge and fan out on
 * hover (or when the chart's crosshair lands on one of the cluster's
 * bucket indices).
 */
export interface OPMarkerCluster {
  /**
   * Date that drives the marker's x position on the chart. For multi-item
   * clusters, this is typically the most important item's date.
   */
  anchorDate: Date | string;
  /** Items in this cluster. The first item's icon is what shows when collapsed. */
  items: OPMarkerItem[];
}

interface OPMarkerLayerProps {
  clusters: OPMarkerCluster[] | null | undefined;
  /** Marker circle size in px. Default 18 (matches favicon pills elsewhere). */
  size?: number;
  /** Show vertical guide line below each cluster. Default false. */
  showLines?: boolean;
  /**
   * Merge clusters whose anchor x-positions are within this pixel distance.
   * Scales sensibly with the chart's xScale: a year of daily data on a
   * narrow chart clusters aggressively; a month of daily data on a wide
   * chart barely clusters at all. Default 32 (marker width + small gap).
   * Pass 0 to disable.
   */
  clusterPixelDistance?: number;
  /** Count-badge circle radius in px. Default 6. */
  badgeRadius?: number;
  /** Count-badge text size in px. Default 8. */
  badgeFontSize?: number;
  /** Offset of badge from marker corner along x/-y. Default 0. */
  badgeOffset?: number;
}

// Markers in this layer use a clean "app icon" look: the icon fills the
// circle edge-to-edge with a high-contrast border (foreground token =
// white in dark mode, dark in light mode). Callers pass fill-aware icons
// (e.g. `<SerieIcon fill />`) so they actually fill the larger
// foreignObject the iconFill flag opens up.
const MARKER_BORDER_COLOR = 'var(--foreground)';
// Cap fanned markers — beyond ~8 the semicircular arc gets too tight and
// markers stack visually. The count badge still shows the true cluster
// size, and the tooltip lists all referrers via its "+ also" line.
const MAX_FANNED_MARKERS = 8;

/**
 * Unified annotation layer for the chart. Both user-curated references and
 * auto-detected referrer spikes route through this — new annotation types
 * (GitHub commits, deploys, etc.) plug in the same way by adapting their
 * data into `OPMarkerCluster[]`.
 *
 * Hover behavior is bidirectional:
 *  - Hovering a marker writes tooltipData for the cluster's anchor bucket,
 *    so the main chart tooltip + crosshair light up as if the user hovered
 *    the chart at that point.
 *  - When the chart's crosshair lands on a bucket covered by any item in a
 *    cluster, that cluster's MarkerGroup fans out automatically.
 */
export function OPMarkerLayer({
  clusters,
  size = 18,
  showLines = false,
  clusterPixelDistance = 32,
  badgeRadius = 6,
  badgeFontSize = 8,
  badgeOffset = 0,
}: OPMarkerLayerProps) {
  const merged = usePixelClusters(clusters, clusterPixelDistance);
  if (merged.length === 0) {
    return null;
  }
  return (
    <>
      {merged.map((cluster, index) => (
        <OPMarkerClusterRenderer
          badgeFontSize={badgeFontSize}
          badgeOffset={badgeOffset}
          badgeRadius={badgeRadius}
          cluster={cluster}
          index={index}
          key={getClusterKey(cluster)}
          showLine={showLines}
          size={size}
        />
      ))}
    </>
  );
}

/**
 * Merge input clusters whose anchor x-positions fall within
 * `pixelDistance` of each other. Walks the input sorted by pixel x,
 * accumulating into the current merge group while distance allows. Merged
 * clusters preserve item order (first input's items first) and keep the
 * first input's anchorDate as the merged anchor.
 */
function usePixelClusters(
  clusters: OPMarkerCluster[] | null | undefined,
  pixelDistance: number
): OPMarkerCluster[] {
  const { xScale } = useChartStable();
  return useMemo(() => {
    if (!clusters || clusters.length === 0) {
      return [];
    }
    if (pixelDistance <= 0) {
      return clusters;
    }

    // Resolve anchor dates + pixel x once, then sort by x so merging is a
    // single pass. Inputs with no resolvable x are dropped.
    const positioned = clusters
      .map((cluster) => {
        const anchorDate =
          typeof cluster.anchorDate === 'string'
            ? new Date(cluster.anchorDate)
            : cluster.anchorDate;
        const x = xScale(anchorDate);
        return x == null ? null : { cluster, anchorDate, x };
      })
      .filter(
        (p): p is { cluster: OPMarkerCluster; anchorDate: Date; x: number } =>
          p !== null
      )
      .sort((a, b) => a.x - b.x);

    if (positioned.length === 0) {
      return [];
    }

    const merged: OPMarkerCluster[] = [];
    let currentItems: OPMarkerItem[] = [...positioned[0]!.cluster.items];
    let currentAnchor: Date | string = positioned[0]!.anchorDate;
    let currentX = positioned[0]!.x;

    for (let i = 1; i < positioned.length; i++) {
      const next = positioned[i]!;
      if (next.x - currentX <= pixelDistance) {
        // Merge into the current cluster — concat items, keep anchor of
        // the earliest member (also gives the visible icon a stable
        // identity across renders).
        currentItems = currentItems.concat(next.cluster.items);
      } else {
        merged.push({ anchorDate: currentAnchor, items: currentItems });
        currentItems = [...next.cluster.items];
        currentAnchor = next.anchorDate;
        currentX = next.x;
      }
    }
    merged.push({ anchorDate: currentAnchor, items: currentItems });
    return merged;
  }, [clusters, xScale, pixelDistance]);
}

OPMarkerLayer.displayName = 'OPMarkerLayer';
// Render after the mouse overlay so markers stay clickable.
(OPMarkerLayer as { __isChartMarkers?: boolean }).__isChartMarkers = true;

function getClusterKey(cluster: OPMarkerCluster): string {
  const anchor =
    typeof cluster.anchorDate === 'string'
      ? cluster.anchorDate
      : cluster.anchorDate.toISOString();
  return `${anchor}-${cluster.items[0]?.title ?? ''}`;
}

interface OPMarkerClusterRendererProps {
  cluster: OPMarkerCluster;
  index: number;
  size: number;
  showLine: boolean;
  badgeRadius: number;
  badgeFontSize: number;
  badgeOffset: number;
}

const OPMarkerClusterRenderer = memo(function OPMarkerClusterRenderer({
  cluster,
  index,
  size,
  showLine,
  badgeRadius,
  badgeFontSize,
  badgeOffset,
}: OPMarkerClusterRendererProps) {
  const {
    data,
    xScale,
    yScale,
    xAccessor,
    lines,
    innerHeight,
    innerWidth,
    margin,
    containerRef,
    animationDuration,
  } = useChartStable();
  const { tooltipData, setTooltipData } = useChartHover();

  const anchorDate = useMemo(
    () =>
      typeof cluster.anchorDate === 'string'
        ? new Date(cluster.anchorDate)
        : cluster.anchorDate,
    [cluster.anchorDate]
  );

  // Pre-compute which data bucket indices this cluster's items map to.
  // On hover the chart provides tooltipData.index; we just check membership.
  const matchingIndices = useMemo(() => {
    const set = new Set<number>();
    for (const item of cluster.items) {
      const itemDate =
        typeof item.date === 'string' ? new Date(item.date) : item.date;
      const idx = findNearestIndex(itemDate, data, xAccessor);
      if (idx >= 0) {
        set.add(idx);
      }
    }
    return set;
  }, [cluster.items, data, xAccessor]);

  const isActive = tooltipData ? matchingIndices.has(tooltipData.index) : false;
  // Fade this cluster whenever the user is interacting with the chart but
  // not on this cluster's bucket — keeps the spotlight on whichever one is
  // active so adjacent clusters don't visually crowd the open fan.
  const isMuted = tooltipData !== null && !isActive;

  // Convert items to ChartMarker payloads — stable per cluster so MarkerGroup
  // doesn't see fresh references on every render.
  const markers = useMemo<ChartMarker[]>(
    () =>
      cluster.items.map((item) => ({
        date: typeof item.date === 'string' ? new Date(item.date) : item.date,
        icon: item.icon,
        title: item.title,
        description: item.description,
        content: item.content,
        color: item.color,
        onClick: item.onClick,
        href: item.href,
        target: item.target,
      })),
    [cluster.items]
  );

  // Marker hover writes the cluster's anchor bucket into the chart's
  // tooltipData. We don't clear on leave — let the chart's own mouseleave
  // handle that, so moving from a marker into the chart doesn't flicker.
  const handleHover = useCallback(
    (hovered: ChartMarker[] | null) => {
      if (!hovered) {
        return;
      }
      const anchorIdx = findNearestIndex(anchorDate, data, xAccessor);
      if (anchorIdx < 0) {
        return;
      }
      // Skip the setState entirely if the chart is already on this bucket.
      if (tooltipData?.index === anchorIdx) {
        return;
      }
      const point = data[anchorIdx];
      if (!point) {
        return;
      }
      const yPositions: Record<string, number> = {};
      for (const line of lines) {
        const value = point[line.dataKey];
        if (typeof value === 'number') {
          yPositions[line.dataKey] = yScale(value) ?? 0;
        }
      }
      const next: TooltipData = {
        point,
        index: anchorIdx,
        x: xScale(anchorDate) ?? 0,
        yPositions,
      };
      setTooltipData(next);
    },
    [
      anchorDate,
      data,
      xAccessor,
      xScale,
      yScale,
      lines,
      tooltipData,
      setTooltipData,
    ]
  );

  // Clamp x so the marker (and its badge) stay fully inside the plot area —
  // otherwise a marker on the first/last bucket gets half-clipped by the SVG
  // and the `overflow-clip` chart wrapper.
  const rawX = xScale(anchorDate) ?? 0;
  const edgePadding = size / 2 + badgeRadius + badgeOffset;
  const x = Math.min(Math.max(rawX, edgePadding), innerWidth - edgePadding);
  const delay = animationDuration / 1000 + index * 0.05;

  return (
    <MarkerGroup
      animate
      animationDelay={delay}
      badgeFontSize={badgeFontSize}
      badgeOffset={badgeOffset}
      badgeRadius={badgeRadius}
      borderColor={MARKER_BORDER_COLOR}
      borderWidth={1}
      containerRef={containerRef}
      forceOpen={isActive}
      iconFill
      isActive={isActive}
      isMuted={isMuted}
      lineHeight={innerHeight}
      marginLeft={margin.left}
      marginTop={margin.top}
      markers={markers}
      maxFanned={MAX_FANNED_MARKERS}
      onHover={handleHover}
      showLine={showLine}
      size={size}
      x={x}
      y={16}
    />
  );
});

function findNearestIndex(
  target: Date,
  data: Record<string, unknown>[],
  xAccessor: (d: Record<string, unknown>) => Date
): number {
  if (data.length === 0) {
    return -1;
  }
  const targetTime = target.getTime();
  let nearestIdx = 0;
  let minDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < data.length; i++) {
    const point = data[i];
    if (!point) {
      continue;
    }
    const diff = Math.abs(xAccessor(point).getTime() - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      nearestIdx = i;
    }
  }
  return nearestIdx;
}
