import { useCallback, useEffect, useRef, useState } from 'react';
import { useZoomPan } from 'react-simple-maps';

import type { Coordinate } from './coordinates';

export const GEO_MAP_URL =
  'https://unpkg.com/world-atlas@2.0.2/countries-50m.json';

export function useAnimatedState(initialValue: number) {
  const [value, setValue] = useState(initialValue);
  const [target, setTarget] = useState(initialValue);
  const ref = useRef<number>();
  const animate = useCallback(() => {
    ref.current = requestAnimationFrame(() => {
      setValue((prevValue) => {
        const diff = target - prevValue;
        if (Math.abs(diff) < 0.01) {
          return target; // Stop animating when close enough
        }
        // Adjust this factor (e.g., 0.02) to control the speed of the animation
        return prevValue + diff * 0.05;
      });
      animate(); // Loop the animation frame
    });
  }, [target]);

  useEffect(() => {
    animate(); // Start the animation
    return () => cancelAnimationFrame(ref.current!); // Cleanup the animation on unmount
  }, [animate]);

  useEffect(() => {
    setTarget(initialValue);
  }, [initialValue]);

  return [value, setTarget] as const;
}

export const getBoundingBox = (coordinates: Coordinate[]) => {
  const longitudes = coordinates.map((coord) => coord.long);
  const latitudes = coordinates.map((coord) => coord.lat);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLong = Math.min(...longitudes);
  const maxLong = Math.max(...longitudes);

  return { minLat, maxLat, minLong, maxLong };
};

export const determineZoom = (
  bbox: ReturnType<typeof getBoundingBox>,
  aspectRatio = 1.0,
): number => {
  const latDiff = bbox.maxLat - bbox.minLat;
  const longDiff = bbox.maxLong - bbox.minLong;

  // Normalize longitudinal span based on latitude to correct for increasing distortion
  // towards the poles in a Mercator projection.
  const avgLat = (bbox.maxLat + bbox.minLat) / 2;
  const longDiffAdjusted = longDiff * Math.cos((avgLat * Math.PI) / 180);

  // Adjust calculations depending on the aspect ratio.
  const maxDiff =
    aspectRatio > 1
      ? Math.max(latDiff / aspectRatio, longDiffAdjusted) // Wider than tall
      : Math.max(latDiff, longDiffAdjusted * aspectRatio); // Taller than wide

  // Adjust zoom level scaling factor based on application or testing.
  const zoom = Math.max(1, Math.min(20, 200 / maxDiff));
  return zoom;
};

export function CustomZoomableGroup({
  zoom,
  center,
  children,
}: {
  zoom: number;
  center: [number, number];
  children: React.ReactNode;
}) {
  const { mapRef, transformString } = useZoomPan({
    center: center,
    zoom,
    filterZoomEvent: () => false,
  });

  return (
    <g ref={mapRef}>
      <g transform={transformString}>{children}</g>
    </g>
  );
}
