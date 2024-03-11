'use client';

import { useEffect, useMemo, useState } from 'react';
import type { IChartData } from '@/app/_trpc/client';

export type IVisibleSeries = ReturnType<typeof useVisibleSeries>['series'];
export function useVisibleSeries(data: IChartData, limit?: number | undefined) {
  const max = limit ?? 5;
  const [visibleSeries, setVisibleSeries] = useState<string[]>(
    data?.series?.slice(0, max).map((serie) => serie.name) ?? []
  );

  useEffect(() => {
    setVisibleSeries(
      data?.series?.slice(0, max).map((serie) => serie.name) ?? []
    );
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
