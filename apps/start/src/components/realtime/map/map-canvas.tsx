import { bind } from 'bind-event-listener';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from 'react-simple-maps';
import {
  calculateGeographicMidpoint,
  clusterCoordinates,
  getAverageCenter,
  getOuterMarkers,
} from './coordinates';
import { determineZoom, GEO_MAP_URL, getBoundingBox } from './map.helpers';
import { createDisplayMarkers } from './map-display-markers';
import { MapMarkerPill } from './map-marker-pill';
import type {
  DisplayMarkerCache,
  GeographyFeature,
  MapCanvasProps,
  MapProjection,
  ZoomMoveEndPosition,
  ZoomMovePosition,
} from './map-types';
import {
  ANCHOR_R,
  isValidCoordinate,
  PILL_GAP,
  PILL_H,
  PILL_W,
} from './map-utils';
import {
  closeMapBadgeDetails,
  openMapBadgeDetails,
} from './realtime-map-badge-slice';
import { useTheme } from '@/hooks/use-theme';
import { useDispatch } from '@/redux';

export const MapCanvas = memo(function MapCanvas({
  projectId,
  markers,
  sidebarConfig,
}: MapCanvasProps) {
  const dispatch = useDispatch();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null
  );
  const [currentZoom, setCurrentZoom] = useState(1);
  const [debouncedZoom, setDebouncedZoom] = useState(1);
  const [viewCenter, setViewCenter] = useState<[number, number]>([0, 20]);
  const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const displayMarkersCacheRef = useRef<DisplayMarkerCache>({
    markers: [],
    projection: null,
    viewportCenter: [0, 20],
    zoom: 1,
    size: null,
    result: [],
  });

  const { center, initialZoom } = useMemo(() => {
    const hull = getOuterMarkers(markers);
    const center =
      hull.length < 2
        ? getAverageCenter(markers)
        : calculateGeographicMidpoint(hull);

    const boundingBox = getBoundingBox(hull.length > 0 ? hull : markers);
    const aspectRatio = size ? size.width / size.height : 1;
    const autoZoom = Math.max(
      1,
      Math.min(20, determineZoom(boundingBox, aspectRatio) * 0.4)
    );
    const initialZoom = markers.length > 0 ? autoZoom : 1;

    return { center, initialZoom };
  }, [markers, size]);

  const updateDebouncedZoom = useCallback((newZoom: number) => {
    if (zoomTimeoutRef.current) {
      clearTimeout(zoomTimeoutRef.current);
    }
    zoomTimeoutRef.current = setTimeout(() => {
      setDebouncedZoom(newZoom);
    }, 100);
  }, []);

  useEffect(() => {
    return () => {
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }
    };
  }, []);

  const { long, lat } = useMemo(() => {
    let adjustedLong = center.long;
    if (sidebarConfig && size) {
      const sidebarOffset =
        sidebarConfig.position === 'left'
          ? sidebarConfig.width / 2
          : -sidebarConfig.width / 2;
      const longitudePerPixel = 360 / (size.width * initialZoom);
      const longitudeOffset = sidebarOffset * longitudePerPixel;
      adjustedLong = center.long - longitudeOffset;
    }
    return { long: adjustedLong, lat: center.lat };
  }, [center.long, center.lat, sidebarConfig, size, initialZoom]);

  useEffect(() => {
    setViewCenter([long, lat]);
    setCurrentZoom(initialZoom);
    setDebouncedZoom(initialZoom);
  }, [long, lat, initialZoom]);

  useEffect(() => {
    return bind(window, {
      type: 'resize',
      listener() {
        if (ref.current) {
          const parentRect = ref.current.getBoundingClientRect();
          setSize({
            width: parentRect.width ?? 0,
            height: parentRect.height ?? 0,
          });
        }
      },
    });
  }, []);

  useEffect(() => {
    if (ref.current) {
      const parentRect = ref.current.getBoundingClientRect();
      setSize({
        width: parentRect.width ?? 0,
        height: parentRect.height ?? 0,
      });
    }
  }, []);

  const theme = useTheme();

  const clusteredMarkers = useMemo(() => {
    return clusterCoordinates(markers, 150, {
      zoom: debouncedZoom,
      adaptiveRadius: true,
    });
  }, [markers, debouncedZoom]);

  const invScale = Number.isNaN(1 / currentZoom) ? 1 : 1 / currentZoom;

  return (
    <div className="relative h-full w-full" ref={ref}>
      <div className="absolute inset-x-0 bottom-0 h-1/10 bg-gradient-to-t from-def-100 to-transparent" />
      {size !== null && (
        <ComposableMap
          height={size.height}
          projection="geoMercator"
          width={size.width}
        >
          <ZoomableGroup
            center={[long, lat]}
            // key={`${long}-${lat}-${initialZoom}`}
            maxZoom={20}
            minZoom={1}
            onMove={(position: ZoomMovePosition) => {
              dispatch(closeMapBadgeDetails());
              if (currentZoom !== position.zoom) {
                setCurrentZoom(position.zoom);
                updateDebouncedZoom(position.zoom);
              }
            }}
            onMoveEnd={(position: ZoomMoveEndPosition) => {
              setViewCenter(position.coordinates);

              if (currentZoom !== position.zoom) {
                setCurrentZoom(position.zoom);
                updateDebouncedZoom(position.zoom);
              }
            }}
            zoom={initialZoom}
          >
            <Geographies geography={GEO_MAP_URL}>
              {({
                geographies,
                projection,
              }: {
                geographies: GeographyFeature[];
                projection: MapProjection;
              }) => {
                const cachedDisplayMarkers = displayMarkersCacheRef.current;
                const cacheMatches =
                  cachedDisplayMarkers.markers === clusteredMarkers &&
                  cachedDisplayMarkers.projection === projection &&
                  cachedDisplayMarkers.viewportCenter[0] === viewCenter[0] &&
                  cachedDisplayMarkers.viewportCenter[1] === viewCenter[1] &&
                  cachedDisplayMarkers.zoom === debouncedZoom &&
                  cachedDisplayMarkers.size?.width === size.width &&
                  cachedDisplayMarkers.size?.height === size.height;

                const displayMarkers = cacheMatches
                  ? cachedDisplayMarkers.result
                  : createDisplayMarkers({
                      markers: clusteredMarkers,
                      projection,
                      viewportCenter: viewCenter,
                      zoom: debouncedZoom,
                      labelZoom: debouncedZoom,
                      size,
                    });

                if (!cacheMatches) {
                  displayMarkersCacheRef.current = {
                    markers: clusteredMarkers,
                    projection,
                    viewportCenter: viewCenter,
                    zoom: debouncedZoom,
                    size,
                    result: displayMarkers,
                  };
                }

                return (
                  <>
                    {geographies
                      .filter(
                        (geo: GeographyFeature) =>
                          geo.properties.name !== 'Antarctica'
                      )
                      .map((geo: GeographyFeature) => (
                        <Geography
                          fill={theme.theme === 'dark' ? '#000' : '#f0f0f0'}
                          geography={geo}
                          key={geo.rsmKey}
                          pointerEvents="none"
                          stroke={theme.theme === 'dark' ? '#333' : '#999'}
                          strokeWidth={0.5}
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}

                    {markers.filter(isValidCoordinate).map((marker, index) => (
                      <Marker
                        coordinates={[marker.long, marker.lat]}
                        key={`point-${index}-${marker.long}-${marker.lat}`}
                      >
                        <g transform={`scale(${invScale})`}>
                          <circle
                            fill="var(--primary)"
                            fillOpacity={0.9}
                            pointerEvents="none"
                            r={ANCHOR_R}
                          />
                        </g>
                      </Marker>
                    ))}

                    {displayMarkers.map((marker, index) => {
                      const coordinates: [number, number] = [
                        marker.center.long,
                        marker.center.lat,
                      ];

                      return (
                        <Marker
                          coordinates={coordinates}
                          key={`cluster-${index}-${marker.center.long}-${marker.center.lat}-${marker.mergedVisualClusters}`}
                        >
                          <g transform={`scale(${invScale})`}>
                            <foreignObject
                              height={PILL_H}
                              overflow="visible"
                              width={PILL_W}
                              x={-PILL_W / 2}
                              y={-(PILL_H + ANCHOR_R + PILL_GAP)}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'center',
                                  height: '100%',
                                  alignItems: 'center',
                                }}
                              >
                                <MapMarkerPill
                                  marker={marker}
                                  onClick={() => {
                                    dispatch(
                                      openMapBadgeDetails({
                                        marker,
                                        projectId,
                                      })
                                    );
                                  }}
                                />
                              </div>
                            </foreignObject>
                          </g>
                        </Marker>
                      );
                    })}
                  </>
                );
              }}
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>
      )}
    </div>
  );
});
