import { useCallback, useMemo, useRef, useState } from 'react';
import type { RouterOutputs } from '@/trpc/client';

export type IVisibleFunnelBreakdowns = ReturnType<
  typeof useVisibleFunnelBreakdowns
>['breakdowns'];

export function useVisibleFunnelBreakdowns(
  data: RouterOutputs['chart']['funnel']['current'],
  options?: {
    limit?: number;
    savedVisibleSeries?: string[] | null;
    onVisibleSeriesChange?: (ids: string[]) => void;
  }
) {
  const max = options?.limit ?? 10;
  const savedVisibleSeries = options?.savedVisibleSeries;

  const onChangeRef = useRef(options?.onVisibleSeriesChange);
  onChangeRef.current = options?.onVisibleSeriesChange;

  const seriesKey = data?.map((s) => s.id).join(',') ?? '';

  const resolveIds = (
    items: RouterOutputs['chart']['funnel']['current']
  ): string[] => {
    if (savedVisibleSeries && savedVisibleSeries.length > 0) {
      const valid = savedVisibleSeries.filter((id) =>
        items.some((s) => s.id === id)
      );
      if (valid.length > 0) {
        return valid;
      }
    }
    return items.slice(0, max).map((s) => s.id);
  };

  const [visibleSeries, setVisibleSeries] = useState<string[]>(() =>
    resolveIds(data ?? [])
  );
  // What the chart first showed for this set of series; "Reset" goes back to it.
  const defaultIdsRef = useRef(visibleSeries);

  const prevKeyRef = useRef(seriesKey);
  if (prevKeyRef.current !== seriesKey) {
    prevKeyRef.current = seriesKey;
    defaultIdsRef.current = resolveIds(data ?? []);
    setVisibleSeries(defaultIdsRef.current);
  }

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
      breakdowns: data
        .map((item, index) => ({ ...item, index }))
        .filter((item) => visibleSeries.includes(item.id)),
      setVisibleSeries: handleSet,
    }),
    [visibleSeries, data, handleSet, isDefaultSelection, reset]
  );
}
