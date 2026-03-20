import type { Coordinate, CoordinateCluster } from './coordinates';
import type { MapBadgeDisplayMarker } from './realtime-map-badge-slice';

export type DisplayMarker = MapBadgeDisplayMarker;

export type ContinentBucket =
  | 'north-america'
  | 'south-america'
  | 'europe'
  | 'africa'
  | 'asia'
  | 'oceania'
  | 'unknown';

export type MapProjection = (
  point: [number, number]
) => [number, number] | null;

export interface ZoomMovePosition {
  zoom: number;
}

export interface ZoomMoveEndPosition {
  coordinates: [number, number];
  zoom: number;
}

export interface GeographyFeature {
  rsmKey: string;
  properties: {
    name?: string;
  };
}

export interface DisplayMarkerCache {
  markers: CoordinateCluster[];
  projection: MapProjection | null;
  viewportCenter: [number, number];
  zoom: number;
  size: { width: number; height: number } | null;
  result: DisplayMarker[];
}

export interface MapSidebarConfig {
  width: number;
  position: 'left' | 'right';
}

export interface RealtimeMapProps {
  projectId: string;
  markers: Coordinate[];
  sidebarConfig?: MapSidebarConfig;
}

export interface MapCanvasProps extends RealtimeMapProps {}
