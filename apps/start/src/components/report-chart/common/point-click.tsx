import { useEffect, useRef } from 'react';
import {
  useChartHover,
  useChartStable,
} from '@/components/charts/chart-context';

/**
 * Calls `onClick` with the data point under the pointer when a bklit chart is
 * clicked. Remembers the last hovered point because the chart clears its
 * tooltip on mousedown, before the click lands.
 */
export function PointClick<T extends Record<string, unknown>>({
  onClick,
}: {
  onClick: (point: T, event: MouseEvent) => void;
}) {
  const { containerRef } = useChartStable();
  const { tooltipData } = useChartHover();
  const pointRef = useRef<T | null>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    if (tooltipData) {
      pointRef.current = tooltipData.point as T;
    }
  }, [tooltipData]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (pointRef.current) {
        onClickRef.current(pointRef.current, event);
      }
    };
    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [containerRef]);

  return null;
}
