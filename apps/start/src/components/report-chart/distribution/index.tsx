import { mixesPerUserBucketKinds } from '@openpanel/core/modules/report/report.constants';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { SeriesWithTable } from '../common/series-with-table';
import { useChartInput, useReportChartContext } from '../context';
import { Chart } from './chart';
import { useTRPC } from '@/integrations/trpc/react';

export function ReportDistributionChart() {
  const { isLazyLoading, report, shareId } = useReportChartContext();
  const isMixed = mixesPerUserBucketKinds(report.series);
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
        enabled: !(isLazyLoading || isMixed),
      }
    )
  );

  if (isMixed) {
    return <Mixed />;
  }

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

  return (
    <SeriesWithTable
      chart={(series) => <Chart series={series} />}
      data={res.data}
    />
  );
}

function Mixed() {
  return (
    <AspectContainer>
      <ReportChartEmpty title="These series can't share a chart">
        Counts use fixed buckets and property values use bins. Change or remove
        a series so they all use the same kind.
      </ReportChartEmpty>
    </AspectContainer>
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
