'use client';

import { useOpenPanel } from '@openpanel/nextjs';
import { useRef } from 'react';

interface FeatureCardHoverTrackProps {
  title: string;
  children: React.ReactNode;
}

export function FeatureCardHoverTrack({
  title,
  children,
}: FeatureCardHoverTrackProps) {
  const { track } = useOpenPanel();
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    hoverTimerRef.current = setTimeout(() => {
      track('feature_card_hover', { title });
      hoverTimerRef.current = null;
    }, 1500);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  return (
    // Hover handlers for analytics only; no keyboard interaction needed
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: analytics hover tracking
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="group"
    >
      {children}
    </div>
  );
}
