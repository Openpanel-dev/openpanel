import { setHiddenSeries } from '@/components/report/reportSlice';
import { useReportChartContext } from '@/components/report-chart/context';
import { useDispatch } from '@/redux';
import type { IChartData } from '@/trpc/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type IVisibleSeries = ReturnType<typeof useVisibleSeries>['series'];
export function useVisibleSeries(data: IChartData, limit?: number | undefined) {
  const max = limit ?? 5;
  const dispatch = useDispatch();
  const { isEditMode, report } = useReportChartContext();

  // Issue 5 fix: stable reference — avoid new array on every render when hiddenSeries is undefined
  const persistedHiddenSeries = useMemo(
    () => (report.hiddenSeries ?? []) as string[],
    [report.hiddenSeries],
  );

  const [visibleSeries, setVisibleSeriesState] = useState<string[]>(() => {
    const allIds = data?.series?.slice(0, max).map((serie) => serie.id) ?? [];
    return allIds.filter((id) => !persistedHiddenSeries.includes(id));
  });

  // Track whether the user has made an in-session toggle (not yet saved)
  const hasUserToggled = useRef(false);

  // Issue 6 fix: only reset visible series from persisted state on initial load
  // or when the report itself changes — not on every data refetch
  const reportIdRef = useRef(report.name); // use name as stable report identity
  useEffect(() => {
    const reportChanged = reportIdRef.current !== report.name;
    reportIdRef.current = report.name;

    if (!hasUserToggled.current || reportChanged) {
      const allIds = data?.series?.slice(0, max).map((serie) => serie.id) ?? [];
      setVisibleSeriesState(
        allIds.filter((id) => !persistedHiddenSeries.includes(id)),
      );
      if (reportChanged) {
        hasUserToggled.current = false;
      }
    }
  }, [data, max, persistedHiddenSeries, report.name]);

  // Issue 3 fix: memoize to avoid recreating on every render
  // Issue 1 fix: only dispatch to Redux when in edit mode
  const setVisibleSeries = useCallback(
    (idsOrFn: string[] | ((prev: string[]) => string[])) => {
      hasUserToggled.current = true;
      setVisibleSeriesState((prev) => {
        const ids = typeof idsOrFn === 'function' ? idsOrFn(prev) : idsOrFn;
        if (isEditMode) {
          const allIds = data?.series?.map((serie) => serie.id) ?? [];
          const hidden = allIds.filter((id) => !ids.includes(id));
          dispatch(setHiddenSeries(hidden));
        }
        return ids;
      });
    },
    [data, isEditMode, dispatch],
  );

  return useMemo(() => {
    return {
      series: data.series
        .map((serie, index) => ({
          ...serie,
          index,
        }))
        .filter((serie) => visibleSeries.includes(serie.id)),
      setVisibleSeries,
    } as const;
  }, [visibleSeries, data.series, setVisibleSeries]);
}
