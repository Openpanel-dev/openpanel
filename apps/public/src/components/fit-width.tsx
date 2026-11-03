'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// The width a full dashboard window is laid out at before it is zoomed down.
export const DASHBOARD_WINDOW_WIDTH = 960;

// Renders a desktop-sized replica at its own width and zooms it down to fit
// narrower containers, so phones see the same layout instead of a squashed
// or sideways-scrolling one.
export function FitWidth({
  width,
  children,
  className,
}: {
  width: number;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // `undefined` until measured, `null` when the replica fits as it is.
  const [zoom, setZoom] = useState<number | null | undefined>(undefined);

  // Measured before the first client paint so the zoom lands with hydration.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const fitTo = (available: number) =>
      setZoom(available < width ? available / width : null);
    fitTo(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        fitTo(entry.contentRect.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);

  const isMeasured = zoom !== undefined;
  const isZoomed = typeof zoom === 'number';

  return (
    <div
      className={cn(
        'overflow-hidden',
        // Phones would otherwise flash the squashed layout before hydration
        !isMeasured && 'max-md:invisible',
        className
      )}
      ref={ref}
    >
      <div style={isZoomed ? { width, zoom } : undefined}>{children}</div>
    </div>
  );
}
