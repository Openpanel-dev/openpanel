import type { RouterOutputs } from '@/trpc/client';
import { useEffect, useMemo, useState } from 'react';

export type IVisibleConversionSeries = ReturnType<
  typeof useVisibleConversionSeries
>['series'];

export function useVisibleConversionSeries(
  data: RouterOutputs['chart']['conversion'],
  limit?: number | undefined,
) {
  const max = limit ?? 5;
  const [visibleSeries, setVisibleSeries] = useState<string[]>(
    data?.current?.slice(0, max).map((serie) => serie.id) ?? [],
  );

  useEffect(() => {
    setVisibleSeries(
      data?.current?.slice(0, max).map((serie) => serie.id) ?? [],
    );
  }, [data, max]);

  return useMemo(() => {
    return {
      series: data.current
        .map((serie, index) => ({
          ...serie,
          index,
        }))
        .filter((serie) => visibleSeries.includes(serie.id)),
      setVisibleSeries,
    } as const;
  }, [visibleSeries, data.current]);
}

