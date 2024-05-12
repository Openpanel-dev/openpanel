import { useCallback, useState } from 'react';

import type { Coordinate } from './coordinates';

const useActiveMarkers = (initialMarkers: Coordinate[]) => {
  const [activeMarkers, setActiveMarkers] = useState(initialMarkers);

  const toggleActiveMarkers = useCallback(() => {
    // Shuffle array function
    const shuffled = [...initialMarkers].sort(() => 0.5 - Math.random());
    // Cut the array in half randomly to simulate changes in active markers
    const selected = shuffled.slice(
      0,
      Math.floor(Math.random() * shuffled.length) + 1
    );
    setActiveMarkers(selected);
  }, [activeMarkers]);

  return { markers: activeMarkers, toggle: toggleActiveMarkers };
};

export default useActiveMarkers;

export function calculateMarkerSize(count: number) {
  const minSize = 8; // Minimum size of the marker
  const maxSize = 40; // Maximum size allowed for the marker

  if (count <= 1) return minSize; // Ensure that we handle count=0 or 1 gracefully
  const scaledSize =
    minSize + (Math.log(count) / Math.log(1000)) * (maxSize - minSize);

  // Ensure size does not exceed maxSize or fall below minSize
  return Math.max(minSize, Math.min(scaledSize, maxSize));
}
