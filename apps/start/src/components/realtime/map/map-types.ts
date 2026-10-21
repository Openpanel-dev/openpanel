import type { RouterOutputs } from '@/trpc/client';

export type RealtimeMapPoint = RouterOutputs['realtime']['coordinates'][number];

/** Screen pixels the map may be dragged past its edges, to clear overlays. */
export interface MapOverscroll {
  x: number;
  y: number;
}

export interface RealtimeMapProps {
  projectId: string;
  markers: RealtimeMapPoint[];
  overscroll?: MapOverscroll;
}

export interface MapLocation {
  city?: string;
  country?: string;
  lat: number;
  long: number;
}

/** What a clicked dot hands to the detail panel; must stay serializable. */
export interface MapBadgeDisplayMarker {
  id: string;
  label: string;
  count: number;
  detailScope: 'coordinate';
  locations: MapLocation[];
  screenPoint: {
    x: number;
    y: number;
  };
}

export type DisplayMarker = MapBadgeDisplayMarker;
