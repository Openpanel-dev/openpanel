import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { AspectContainer } from '../aspect-container';
import { ChartWithTable, TableCard } from '../common/chart-with-table';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { useChartInput, useReportChartContext } from '../context';
import { Chart } from './chart';
import { Summary } from './summary';
import { ConversionTable } from './table';
import { changeVisibleSeries } from '@/components/report/reportSlice';
import { useVisibleConversionSeries } from '@/hooks/use-visible-conversion-series';
import { useTRPC } from '@/integrations/trpc/react';
import { useDispatch } from '@/redux';
import type { RouterOutputs } from '@/trpc/client';

const VISIBLE_SERIES_LIMIT = 5;

export function ReportConversionChart() {
  const { isLazyLoading, shareId } = useReportChartContext();
  const chartInput = useChartInput();
  const trpc = useTRPC();
  const res = useQuery(
    trpc.chart.conversion.queryOptions(
      {
        ...chartInput,
        shareId,
      },
      {
        placeholderData: keepPreviousData,
        enabled: !isLazyLoading,
      }
    )
  );

  if (
    isLazyLoading ||
    res.isLoading ||
    (res.isFetching && !res.data?.current.length)
  ) {
    return <Loading />;
  }

  if (res.isError) {
    return <Error />;
  }

  if (!res.data || res.data?.current.length === 0) {
    return <Empty />;
  }

  return <ConversionWithTable data={res.data} />;
}

function ConversionWithTable({
  data,
}: {
  data: RouterOutputs['chart']['conversion'];
}) {
  const {
    report: { visibleSeries: savedVisibleSeries },
    isEditMode,
  } = useReportChartContext();
  const dispatch = useDispatch();
  const { series, setVisibleSeries } = useVisibleConversionSeries(data, {
    limit: VISIBLE_SERIES_LIMIT,
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
    <ChartWithTable
      chart={<Chart series={series} />}
      summary={<Summary data={data} />}
      tables={
        <TableCard>
          <ConversionTable
            data={data}
            onToggle={isEditMode ? toggleSeries : undefined}
            onUnselectAll={isEditMode ? () => setVisibleSeries([]) : undefined}
            visibleIds={visibleIds}
          />
        </TableCard>
      }
    />
  );
}

function Loading() {
  return (
    <AspectContainer>
      <ReportChartLoading />
    </AspectContainer>
  );
}

function Error() {
  return (
    <AspectContainer>
      <ReportChartError />
    </AspectContainer>
  );
}

function Empty() {
  return (
    <AspectContainer>
      <ReportChartEmpty />
    </AspectContainer>
  );
}
