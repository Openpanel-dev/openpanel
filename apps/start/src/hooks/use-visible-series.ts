import type { IChartData } from '@/trpc/client';
import { useCallback, useMemo, useRef, useState } from 'react';

export type IVisibleSeries = ReturnType<typeof useVisibleSeries>['series'];

export function useVisibleSeries(
  data: IChartData,
  options?: {
    limit?: number;
    savedVisibleSeries?: string[] | null;
    onVisibleSeriesChange?: (ids: string[]) => void;
  },
) {
  const max = options?.limit ?? 5;
  const savedVisibleSeries = options?.savedVisibleSeries;

  // Ref for the callback so handleSet never changes identity
  const onChangeRef = useRef(options?.onVisibleSeriesChange);
  onChangeRef.current = options?.onVisibleSeriesChange;

  // Stable key derived from actual series IDs — not the data reference
  const seriesKey = data?.series?.map((s) => s.id).join(',') ?? '';

  const resolveIds = (series: IChartData['series']): string[] => {
    if (savedVisibleSeries && savedVisibleSeries.length > 0) {
      const valid = savedVisibleSeries.filter((id) =>
        series.some((s) => s.id === id),
      );
      if (valid.length > 0) return valid;
    }
    return series.slice(0, max).map((s) => s.id);
  };

  const [visibleSeries, setVisibleSeries] = useState<string[]>(() =>
    resolveIds(data?.series ?? []),
  );

  // Reset only when the actual series IDs change (breakdowns/events changed),
  // not when the data object reference changes. This is React's recommended
  // pattern for adjusting state based on changed props during render.
  const prevKeyRef = useRef(seriesKey);
  if (prevKeyRef.current !== seriesKey) {
    prevKeyRef.current = seriesKey;
    setVisibleSeries(resolveIds(data?.series ?? []));
  }

  // Stable setter that notifies parent without recreating on every render
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
      series: data.series
        .map((serie, index) => ({ ...serie, index }))
        .filter((serie) => visibleSeries.includes(serie.id)),
      setVisibleSeries: handleSet,
    }),
    [visibleSeries, data.series, handleSet],
  );
}
