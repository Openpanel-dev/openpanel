import { useTRPC } from '@/integrations/trpc/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { useReportChartContext } from '../context';
import { Chart } from './chart';

export function ReportBarChart() {
  const { isLazyLoading, report } = useReportChartContext();
  const trpc = useTRPC();

  const res = useQuery(
    trpc.chart.chart.queryOptions(report, {
      placeholderData: keepPreviousData,
      staleTime: 1000 * 60 * 1,
      enabled: !isLazyLoading,
    }),
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

function Loading() {
  return (
    <AspectContainer className="col gap-4 overflow-hidden">
      {Array.from({ length: 10 }).map((_, index) => (
        <div
          key={index as number}
          className="row animate-pulse justify-between"
        >
          <div className="h-4 w-2/5 rounded bg-def-200" />
          <div className="row w-1/5 gap-2">
            <div className="h-4 w-full rounded bg-def-200" />
            <div className="h-4 w-full rounded bg-def-200" />
            <div className="h-4 w-full rounded bg-def-200" />
          </div>
        </div>
      ))}
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
