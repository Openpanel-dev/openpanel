import type { RouterOutputs } from '@/trpc/client';
import { useCallback, useMemo, useRef, useState } from 'react';

export type IVisibleConversionSeries = ReturnType<
  typeof useVisibleConversionSeries
>['series'];

export function useVisibleConversionSeries(
  data: RouterOutputs['chart']['conversion'],
  options?: {
    limit?: number;
    savedVisibleSeries?: string[] | null;
    onVisibleSeriesChange?: (ids: string[]) => void;
  },
) {
  const max = options?.limit ?? 5;
  const savedVisibleSeries = options?.savedVisibleSeries;

  const onChangeRef = useRef(options?.onVisibleSeriesChange);
  onChangeRef.current = options?.onVisibleSeriesChange;

  const seriesKey = data?.current?.map((s) => s.id).join(',') ?? '';

  const resolveIds = (
    series: RouterOutputs['chart']['conversion']['current'],
  ): string[] => {
    if (savedVisibleSeries && savedVisibleSeries.length > 0) {
      const valid = savedVisibleSeries.filter((id) =>
        series.some((s) => s.id === id),
      );
      if (valid.length > 0) return valid;
    }
    return series.slice(0, max).map((s) => s.id);
  };

  const [visibleSeries, setVisibleSeries] = useState<string[]>(() =>
    resolveIds(data?.current ?? []),
  );

  const prevKeyRef = useRef(seriesKey);
  if (prevKeyRef.current !== seriesKey) {
    prevKeyRef.current = seriesKey;
    setVisibleSeries(resolveIds(data?.current ?? []));
  }

  const handleSet = useCallback<React.Dispatch<React.SetStateAction<string[]>>>(
    (action) => {
      setVisibleSeries((prev) => {
        const next = typeof action === 'function' ? action(prev) : action;
        onChangeRef.current?.(next);
        return next;
      });
    },
    [],
  );

  return useMemo(
    () => ({
      series: data.current
        .map((serie, index) => ({ ...serie, index }))
        .filter((serie) => visibleSeries.includes(serie.id)),
      setVisibleSeries: handleSet,
    }),
    [visibleSeries, data.current, handleSet],
  );
}
