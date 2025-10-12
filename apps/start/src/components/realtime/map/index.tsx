import { Tooltiper } from '@/components/ui/tooltip';
import { bind } from 'bind-event-listener';
import { Fragment, useEffect, useRef, useState } from 'react';
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

  // Calculate center based on markers
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

  // Update current zoom when initial zoom changes (when new markers are loaded)
  useEffect(() => {
    setCurrentZoom(initialZoom);
  }, [initialZoom]);

  // Adjust center coordinates to shift viewport for sidebar
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

  const long = adjustedLong;
  const lat = center.lat;

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
  const getMarkerSize = (baseSize: number) => {
    // Use more gradual scaling since we now have a better base size range (4-20px)
    // At zoom 1: full size
    // At zoom 4: ~50% of base size
    // At zoom 8: ~25% of base size
    const scaleFactor = Math.max(0.25, 1 / Math.sqrt(currentZoom));

    // Ensure minimum size for visibility, but allow smaller sizes for precision
    const minSize = baseSize * 0.05;
    const scaledSize = baseSize * scaleFactor;

    return Math.max(minSize, scaledSize);
  };

  const getBorderWidth = () => {
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
  };

  const theme = useTheme();

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
                        fill={theme.theme === 'dark' ? '#000' : '#e5eef6'}
                        stroke={theme.theme === 'dark' ? '#333' : '#bcccda'}
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
              {clusterCoordinates(markers, 150, {
                zoom: currentZoom,
                adaptiveRadius: true,
              }).map((marker, index) => {
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
