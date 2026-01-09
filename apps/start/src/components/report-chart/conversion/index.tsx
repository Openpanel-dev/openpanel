import { useTRPC } from '@/integrations/trpc/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { cn } from '@/utils/cn';
import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { useReportChartContext } from '../context';
import { Chart } from './chart';
import { Summary } from './summary';

export function ReportConversionChart() {
  const { isLazyLoading, report, shareId, shareType } = useReportChartContext();
  const trpc = useTRPC();
  const { range, startDate, endDate, interval } = useOverviewOptions();
  console.log(report.limit);
  const res = useQuery(
    shareId && shareType && 'id' in report && report.id
      ? trpc.chart.conversionByReport.queryOptions(
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
      : trpc.chart.conversion.queryOptions(report, {
          placeholderData: keepPreviousData,
          staleTime: 1000 * 60 * 1,
          enabled: !isLazyLoading,
        }),
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

  return (
    <div>
      <Summary data={res.data} />
      <AspectContainer>
        <Chart data={res.data} />
      </AspectContainer>
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
