import { useTRPC } from '@/integrations/trpc/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { useReportChartContext } from '../context';
import { Chart } from './chart';

export function ReportMetricChart() {
  const { isLazyLoading, report, shareId, shareType } = useReportChartContext();
  const trpc = useTRPC();
  const { range, startDate, endDate, interval } = useOverviewOptions();

  const res = useQuery(
    shareId && shareType && 'id' in report && report.id
      ? trpc.chart.chartByReport.queryOptions(
          {
            reportId: report.id,
            shareId,
            shareType,
            range: range ?? undefined,
            startDate: startDate ?? undefined,
            endDate: endDate ?? undefined,
            interval: interval ?? undefined,
          },
          {
            placeholderData: keepPreviousData,
            staleTime: 1000 * 60 * 1,
            enabled: !isLazyLoading,
          },
        )
      : trpc.chart.chart.queryOptions(report, {
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
