import { useTRPC } from '@/integrations/trpc/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { useReportChartContext } from '../context';
import { Chart } from './chart';

export function ReportMetricChart() {
  const { isLazyLoading, report, shareId } = useReportChartContext();
  const trpc = useTRPC();

  const res = useQuery(
    trpc.chart.chart.queryOptions(
      {
        ...report,
        shareId,
      },
      {
        placeholderData: keepPreviousData,
        staleTime: 1000 * 60 * 1,
        enabled: !isLazyLoading,
      },
    ),
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

  return <Chart data={res.data} />;
}

export function Loading() {
  return (
    <div className="flex h-[78px] flex-col justify-between p-4">
      <div className="h-3 w-1/2 animate-pulse rounded bg-def-200" />
      <div className="row items-end justify-between">
        <div className="h-6 w-1/3 animate-pulse rounded bg-def-200" />
        <div className="h-3 w-1/5 animate-pulse rounded bg-def-200" />
      </div>
    </div>
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
