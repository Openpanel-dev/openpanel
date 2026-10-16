import { useCallback, useMemo, useRef, useState } from 'react';
import type { IChartData } from '@/trpc/client';

export type IVisibleSeries = ReturnType<typeof useVisibleSeries>['series'];

export function useVisibleSeries(
  data: IChartData,
  options?: {
    limit?: number;
    savedVisibleSeries?: string[] | null;
    onVisibleSeriesChange?: (ids: string[]) => void;
  }
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
        series.some((s) => s.id === id)
      );
      if (valid.length > 0) {
        return valid;
      }
    }
    return series.slice(0, max).map((s) => s.id);
  };

  const [visibleSeries, setVisibleSeries] = useState<string[]>(() =>
    resolveIds(data?.series ?? [])
  );
  // What the chart first showed for this set of series; "Reset" goes back to it.
  const defaultIdsRef = useRef(visibleSeries);

  // Reset only when the actual series IDs change (breakdowns/events changed),
  // not when the data object reference changes. This is React's recommended
  // pattern for adjusting state based on changed props during render.
  const prevKeyRef = useRef(seriesKey);
  if (prevKeyRef.current !== seriesKey) {
    prevKeyRef.current = seriesKey;
    defaultIdsRef.current = resolveIds(data?.series ?? []);
    setVisibleSeries(defaultIdsRef.current);
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
    []
  );

  const defaultIds = defaultIdsRef.current;
  const isDefaultSelection =
    defaultIds.length === visibleSeries.length &&
    defaultIds.every((id) => visibleSeries.includes(id));
  const resetRef = useRef<() => void>(() => undefined);
  resetRef.current = () => handleSet(defaultIds);
  const reset = useCallback(() => resetRef.current(), []);

  return useMemo(
    () => ({
      isDefaultSelection,
      reset,
      series: data.series
        .map((serie, index) => ({ ...serie, index }))
        .filter((serie) => visibleSeries.includes(serie.id)),
      setVisibleSeries: handleSet,
    }),
    [visibleSeries, data.series, handleSet, isDefaultSelection, reset]
  );
}
