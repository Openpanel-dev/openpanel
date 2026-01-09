import { useTRPC } from '@/integrations/trpc/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { cn } from '@/utils/cn';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { useReportChartContext } from '../context';
import { Chart } from './chart';

export function ReportLineChart() {
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

  return (
    <AspectContainer>
      <Chart data={res.data} />
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
