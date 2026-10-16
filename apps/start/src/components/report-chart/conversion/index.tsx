import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { useChartInput, useReportChartContext } from '../context';
import { Chart } from './chart';
import { ConversionTable } from './conversion-table';
import { Summary } from './summary';
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
    layout,
  } = useReportChartContext();
  const dispatch = useDispatch();
  const { series, setVisibleSeries } = useVisibleConversionSeries(data, {
    limit: VISIBLE_SERIES_LIMIT,
    savedVisibleSeries,
    onVisibleSeriesChange: isEditMode
      ? (ids) => dispatch(changeVisibleSeries(ids))
      : undefined,
  });

  // A dashboard tile is the chart alone; the summary and the table belong to
  // the editor and the share page.
  if (layout === 'fill') {
    return (
      <AspectContainer>
        <Chart series={series} />
      </AspectContainer>
    );
  }

  return (
    <div>
      <Summary data={data} />
      <AspectContainer>
        <Chart series={series} />
      </AspectContainer>
      <ConversionTable
        data={data}
        setVisibleSeries={setVisibleSeries}
        visibleSeries={series}
      />
    </div>
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
