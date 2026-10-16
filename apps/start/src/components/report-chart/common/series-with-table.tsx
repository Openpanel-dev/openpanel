import { type ReactNode, useCallback, useMemo } from 'react';
import { AspectContainer } from '../aspect-container';
import { useReportChartContext } from '../context';
import { SeriesTable } from './series-table';
import { changeVisibleSeries } from '@/components/report/reportSlice';
import {
  type IVisibleSeries,
  useVisibleSeries,
} from '@/hooks/use-visible-series';
import { useDispatch } from '@/redux';
import type { IChartData } from '@/trpc/client';

/**
 * The chart for the visible series with the series table under it. A
 * dashboard tile shows the chart alone; the editor's table toggles series,
 * the share page's is read-only.
 */
export function SeriesWithTable({
  data,
  chart,
}: {
  data: IChartData;
  chart: (series: IVisibleSeries) => ReactNode;
}) {
  const {
    report: { visibleSeries: savedVisibleSeries },
    isEditMode,
    layout,
  } = useReportChartContext();
  const dispatch = useDispatch();
  const { series, setVisibleSeries } = useVisibleSeries(data, {
    savedVisibleSeries,
    onVisibleSeriesChange: isEditMode
      ? (ids) => dispatch(changeVisibleSeries(ids))
      : undefined,
  });
  const visibleIds = useMemo(
    () => new Set(series.map((serie) => serie.id)),
    [series]
  );
  const toggleSeries = useCallback(
    (id: string) =>
      setVisibleSeries((ids) =>
        ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
      ),
    [setVisibleSeries]
  );

  return (
    <>
      <AspectContainer>{chart(series)}</AspectContainer>
      {layout !== 'fill' && (
        <div className="card mt-4 overflow-hidden">
          <SeriesTable
            data={data}
            onToggle={isEditMode ? toggleSeries : undefined}
            onUnselectAll={isEditMode ? () => setVisibleSeries([]) : undefined}
            visibleIds={visibleIds}
          />
        </div>
      )}
    </>
  );
}
