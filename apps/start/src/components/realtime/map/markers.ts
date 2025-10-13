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
      Math.floor(Math.random() * shuffled.length) + 1,
    );
    setActiveMarkers(selected);
  }, [activeMarkers]);

  return { markers: activeMarkers, toggle: toggleActiveMarkers };
};

export default useActiveMarkers;

export function calculateMarkerSize(count: number) {
  const minSize = 3; // Minimum size for single visitor (reduced from 4)
  const maxSize = 14; // Maximum size for very large clusters (reduced from 20)

  if (count <= 1) return minSize;

  // Use square root scaling for better visual differentiation
  // This creates more noticeable size differences for common visitor counts
  // Examples:
  // 1 visitor: 3px
  // 2 visitors: ~5px
  // 5 visitors: ~7px
  // 10 visitors: ~9px
  // 25 visitors: ~12px
  // 50+ visitors: ~14px (max)
  const scaledSize = minSize + Math.sqrt(count - 1) * 1.8;

  // Ensure size does not exceed maxSize or fall below minSize
  return Math.max(minSize, Math.min(scaledSize, maxSize));
}
