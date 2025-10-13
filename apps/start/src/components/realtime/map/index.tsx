import { Tooltiper } from '@/components/ui/tooltip';
import { bind } from 'bind-event-listener';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from 'react-simple-maps';

import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { useTheme } from '@/hooks/use-theme';
import type { Coordinate } from './coordinates';

// Interpolate function similar to React Native Reanimated
const interpolate = (
  value: number,
  inputRange: [number, number],
  outputRange: [number, number],
  extrapolate?: 'clamp' | 'extend' | 'identity',
): number => {
  const [inputMin, inputMax] = inputRange;
  const [outputMin, outputMax] = outputRange;

  // Handle edge cases
  if (inputMin === inputMax) return outputMin;

  const progress = (value - inputMin) / (inputMax - inputMin);

  // Apply extrapolation
  if (extrapolate === 'clamp') {
    const clampedProgress = Math.max(0, Math.min(1, progress));
    return outputMin + clampedProgress * (outputMax - outputMin);
  }

  return outputMin + progress * (outputMax - outputMin);
};
import {
  calculateGeographicMidpoint,
  clusterCoordinates,
  getAverageCenter,
  getOuterMarkers,
} from './coordinates';
import { GEO_MAP_URL, determineZoom, getBoundingBox } from './map.helpers';
import { calculateMarkerSize } from './markers';

type Props = {
  markers: Coordinate[];
  sidebarConfig?: {
    width: number;
    position: 'left' | 'right';
  };
};
const Map = ({ markers, sidebarConfig }: Props) => {
  const showCenterMarker = false;
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [currentZoom, setCurrentZoom] = useState(1);
  const [debouncedZoom, setDebouncedZoom] = useState(1);
  const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Memoize expensive calculations
  const { hull, center, initialZoom } = useMemo(() => {
    const hull = getOuterMarkers(markers);
    const center =
      hull.length < 2
        ? getAverageCenter(markers)
        : calculateGeographicMidpoint(hull);

    // Calculate initial zoom based on markers distribution
    const boundingBox = getBoundingBox(hull.length > 0 ? hull : markers);
    const minZoom = 1;
    const maxZoom = 20;

    const aspectRatio = size ? size.width / size.height : 1;
    const autoZoom = Math.max(
      minZoom,
      Math.min(maxZoom, determineZoom(boundingBox, aspectRatio) * 0.4),
    );

    // Use calculated zoom if we have markers, otherwise default to 1
    const initialZoom = markers.length > 0 ? autoZoom : 1;

    return { hull, center, initialZoom };
  }, [markers, size]);

  // Update current zoom when initial zoom changes (when new markers are loaded)
  useEffect(() => {
    setCurrentZoom(initialZoom);
    setDebouncedZoom(initialZoom);
  }, [initialZoom]);

  // Debounced zoom update for marker clustering
  const updateDebouncedZoom = useCallback((newZoom: number) => {
    if (zoomTimeoutRef.current) {
      clearTimeout(zoomTimeoutRef.current);
    }

    zoomTimeoutRef.current = setTimeout(() => {
      setDebouncedZoom(newZoom);
    }, 100); // 100ms debounce delay
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }
    };
  }, []);

  // Memoize center coordinates adjustment for sidebar
  const { long, lat } = useMemo(() => {
    let adjustedLong = center.long;

    if (sidebarConfig && size) {
      // Calculate how much to shift the map to center content in visible area
      const sidebarOffset =
        sidebarConfig.position === 'left'
          ? sidebarConfig.width / 2
          : -sidebarConfig.width / 2;

      // Convert pixel offset to longitude degrees
      // This is a rough approximation - degrees per pixel at current zoom
      const longitudePerPixel = 360 / (size.width * initialZoom);
      const longitudeOffset = sidebarOffset * longitudePerPixel;

      adjustedLong = center.long - longitudeOffset; // Subtract to shift map right for left sidebar
    }

    return { long: adjustedLong, lat: center.lat };
  }, [center.long, center.lat, sidebarConfig, size, initialZoom]);

  const minZoom = 1;
  const maxZoom = 20;

  useEffect(() => {
    return bind(window, {
      type: 'resize',
      listener() {
        if (ref.current) {
          const parentRect = ref.current.parentElement?.getBoundingClientRect();
          setSize({
            width: parentRect?.width ?? 0,
            height: parentRect?.height ?? 0,
          });
        }
      },
    });
  }, []);

  useEffect(() => {
    if (ref.current) {
      const parentRect = ref.current.parentElement?.getBoundingClientRect();
      setSize({
        width: parentRect?.width ?? 0,
        height: parentRect?.height ?? 0,
      });
    }
  }, []);

  // Dynamic marker size based on zoom level - balanced scaling for new size range
  const getMarkerSize = useCallback(
    (baseSize: number) => {
      // Interpolate the adjustment value from zoom 1 to 20
      // At zoom 1: adjustThisValue = 1
      // At zoom 20: adjustThisValue = 0.5
      const adjustThisValue = interpolate(
        currentZoom,
        [1, 20],
        [1.5, 0.6],
        'clamp',
      );
      const scaleFactor = (1 / Math.sqrt(currentZoom)) * adjustThisValue;

      // Ensure minimum size for visibility, but allow smaller sizes for precision
      const minSize = baseSize * 0.05;
      const scaledSize = baseSize * scaleFactor;

      return Math.max(minSize, scaledSize);
    },
    [currentZoom],
  );

  const getBorderWidth = useCallback(() => {
    const map = {
      0.1: [15, 20],
      0.15: [10, 15],
      0.25: [5, 10],
      0.5: [0, 5],
    };
    const found = Object.entries(map).find(([, value]) => {
      if (currentZoom >= value[0] && currentZoom <= value[1]) {
        return true;
      }
    });
    return found ? Number.parseFloat(found[0]) : 0.1;
  }, [currentZoom]);

  const theme = useTheme();

  // Memoize clustered markers
  const clusteredMarkers = useMemo(() => {
    return clusterCoordinates(markers, 150, {
      zoom: debouncedZoom,
      adaptiveRadius: true,
    });
  }, [markers, debouncedZoom]);

  return (
    <div ref={ref} className="relative">
      <div className="bg-gradient-to-t from-def-100 to-transparent h-1/10 absolute bottom-0 left-0 right-0" />
      {size === null ? (
        <></>
      ) : (
        <>
          <ComposableMap
            projection="geoMercator"
            width={size?.width || 800}
            height={size?.height || 400}
          >
            <ZoomableGroup
              center={[long, lat]}
              zoom={initialZoom}
              minZoom={minZoom}
              maxZoom={maxZoom}
              onMove={(event) => {
                if (currentZoom !== event.zoom) {
                  setCurrentZoom(event.zoom);
                  updateDebouncedZoom(event.zoom);
                }
              }}
            >
              <Geographies geography={GEO_MAP_URL}>
                {({ geographies }) =>
                  geographies
                    .filter((geo) => {
                      return geo.properties.name !== 'Antarctica';
                    })
                    .map((geo) => (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={theme.theme === 'dark' ? '#000' : '#f0f0f0'}
                        stroke={theme.theme === 'dark' ? '#333' : '#999'}
                        strokeWidth={getBorderWidth()}
                        pointerEvents={'none'}
                      />
                    ))
                }
              </Geographies>
              {showCenterMarker && (
                <Marker coordinates={[center.long, center.lat]}>
                  <circle r={getMarkerSize(10)} fill="green" stroke="#fff" />
                </Marker>
              )}
              {clusteredMarkers.map((marker, index) => {
                const size = getMarkerSize(calculateMarkerSize(marker.count));
                const coordinates: [number, number] = [
                  marker.center.long,
                  marker.center.lat,
                ];

                return (
                  <Fragment
                    key={`cluster-${index}-${marker.center.long}-${marker.center.lat}`}
                  >
                    {/* Animated ping effect */}
                    <Marker coordinates={coordinates}>
                      <circle
                        r={size}
                        fill={theme.theme === 'dark' ? '#3d79ff' : '#2266ec'}
                        className="animate-ping opacity-20"
                      />
                    </Marker>
                    {/* Main marker with tooltip */}
                    <Tooltiper
                      asChild
                      content={
                        <div className="flex min-w-[200px] flex-col gap-2">
                          <h3 className="font-semibold capitalize">
                            {`${marker.count} visitor${marker.count !== 1 ? 's' : ''}`}
                          </h3>

                          {marker.members
                            .slice(0, 5)
                            .filter((item) => item.country || item.city)
                            .map((item) => (
                              <div
                                className="row items-center gap-2"
                                key={`${item.long}-${item.lat}`}
                              >
                                <SerieIcon
                                  name={
                                    item.country || `${item.lat}, ${item.long}`
                                  }
                                />
                                {item.city || 'Unknown'}
                              </div>
                            ))}
                          {marker.members.length > 5 && (
                            <div className="text-sm text-gray-500">
                              + {marker.members.length - 5} more
                            </div>
                          )}
                        </div>
                      }
                    >
                      <Marker coordinates={coordinates}>
                        <circle
                          r={size}
                          fill={theme.theme === 'dark' ? '#3d79ff' : '#2266ec'}
                          fillOpacity={0.8}
                          stroke="#fff"
                          strokeWidth={getBorderWidth() * 0.5}
                        />
                        <text
                          x={0}
                          y={0}
                          fill="#fff"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={size * 0.6}
                          fontWeight="bold"
                        >
                          {marker.count}
                        </text>
                      </Marker>
                    </Tooltiper>
                  </Fragment>
                );
              })}
            </ZoomableGroup>
          </ComposableMap>
        </>
      )}
    </div>
  );
};

export default Map;
