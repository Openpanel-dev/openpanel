import { useEffect, useMemo, useRef, useState } from 'react';
import type { IChartData } from '@/app/_trpc/client';

export function useVisibleSeries(data: IChartData, limit?: number | undefined) {
  const max = limit ?? 20;
  const [visibleSeries, setVisibleSeries] = useState<string[]>([]);
  const ref = useRef(false);
  useEffect(() => {
    if (!ref.current && data) {
      setVisibleSeries(
        data?.series?.slice(0, max).map((serie) => serie.name) ?? []
      );
      // ref.current = true;
    }
  }, [data, max]);

  return useMemo(() => {
    return {
      series: data.series
        .map((serie, index) => ({
          ...serie,
          index,
        }))
        .filter((serie) => visibleSeries.includes(serie.name)),
      setVisibleSeries,
    } as const;
  }, [visibleSeries, data.series]);
}
