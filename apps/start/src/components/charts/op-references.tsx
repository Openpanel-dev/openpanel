import { FlagIcon } from 'lucide-react';
import { useMemo } from 'react';
import type { ChartMarker } from './markers/marker-group';
import {
  OPMarkerLayer,
  type OPMarkerCluster,
  type OPMarkerItem,
} from './op-marker-layer';

export interface OPReferenceItem {
  id: string;
  date: Date | string;
  title: string;
  description?: string | null;
}

/**
 * Convert OpenPanel reference rows into ChartMarker[] for use by the
 * tooltip's `useReferencesForHoveredPoint` lookup (independent of the chart
 * marker rendering, which goes through OPMarkerLayer).
 */
export function toChartMarkers(
  items: OPReferenceItem[] | null | undefined,
): ChartMarker[] {
  if (!items || items.length === 0) return [];
  return items.map((item) => ({
    date: typeof item.date === 'string' ? new Date(item.date) : item.date,
    icon: <FlagIcon className="size-2.5" />,
    title: item.title,
    description: item.description ?? undefined,
  }));
}

interface OPReferencesProps {
  items: OPReferenceItem[] | null | undefined;
  /** Marker circle size in px. Defaults via OPMarkerLayer. */
  size?: number;
  /** Show vertical guide line under each marker. Default: true. */
  showLines?: boolean;
}

/**
 * Renders user-curated reference annotations through the shared marker
 * layer. One cluster per reference — OPMarkerLayer handles visual density
 * via pixel-based merging using the live chart xScale, so dense ranges
 * naturally fan instead of overlapping. Inherits bidirectional hover
 * (marker ↔ chart tooltip) from OPMarkerLayer.
 */
export function OPReferences({
  items,
  size,
  showLines = true,
}: OPReferencesProps) {
  const clusters = useMemo<OPMarkerCluster[]>(() => {
    if (!items || items.length === 0) return [];
    return items.map((ref) => {
      const date = typeof ref.date === 'string' ? new Date(ref.date) : ref.date;
      const item: OPMarkerItem = {
        date,
        icon: <FlagIcon className="size-2.5" />,
        title: ref.title,
        description: ref.description ?? undefined,
      };
      return { anchorDate: date, items: [item] };
    });
  }, [items]);
  return <OPMarkerLayer clusters={clusters} showLines={showLines} size={size} />;
}
