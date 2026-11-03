'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [zoom, setZoom] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const available = entry?.contentRect.width ?? width;
      setZoom(available < width ? available / width : null);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div className={cn('overflow-hidden', className)} ref={ref}>
      <div style={zoom === null ? undefined : { width, zoom }}>{children}</div>
    </div>
  );
}
