import type { ReactNode } from 'react';
import { AspectContainer } from '../aspect-container';
import { useReportChartContext } from '../context';
import { ReportTable } from './report-table';
import { changeVisibleSeries } from '@/components/report/reportSlice';
import {
  type IVisibleSeries,
  useVisibleSeries,
} from '@/hooks/use-visible-series';
import { useDispatch } from '@/redux';
import type { IChartData } from '@/trpc/client';

/** Renders the chart for the visible series, and in the editor the series table under it that toggles them. */
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
  } = useReportChartContext();
  const dispatch = useDispatch();
  const { series, setVisibleSeries } = useVisibleSeries(data, {
    savedVisibleSeries,
    onVisibleSeriesChange: isEditMode
      ? (ids) => dispatch(changeVisibleSeries(ids))
      : undefined,
  });

  return (
    <>
      <AspectContainer>{chart(series)}</AspectContainer>
      {isEditMode && (
        <ReportTable
          data={data}
          setVisibleSeries={setVisibleSeries}
          visibleSeries={series}
        />
      )}
    </>
  );
}
