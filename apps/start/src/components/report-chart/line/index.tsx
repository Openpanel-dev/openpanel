import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { ReportTable } from '../common/report-table';
import { useChartInput, useReportChartContext } from '../context';
import { Chart } from './chart';
import { changeVisibleSeries } from '@/components/report/reportSlice';
import { useVisibleSeries } from '@/hooks/use-visible-series';
import { useTRPC } from '@/integrations/trpc/react';
import { useDispatch } from '@/redux';
import type { IChartData } from '@/trpc/client';

export function ReportLineChart() {
  const { isLazyLoading, shareId } = useReportChartContext();
  const chartInput = useChartInput();
  const trpc = useTRPC();
  const res = useQuery(
    trpc.chart.chart.queryOptions(
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
    (res.isFetching && !res.data?.series.length)
  ) {
    return <Loading />;
  }

  if (res.isError) {
    return <Error />;
  }

  if (!res.data || res.data?.series.length === 0) {
    return <Empty />;
  }

  return <LineChartWithTable data={res.data} />;
}

function LineChartWithTable({ data }: { data: IChartData }) {
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
      <AspectContainer>
        <Chart data={data} series={series} />
      </AspectContainer>
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
