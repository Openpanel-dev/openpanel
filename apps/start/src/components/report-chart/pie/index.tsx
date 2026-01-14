import { useTRPC } from '@/integrations/trpc/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { useReportChartContext } from '../context';
import { Chart } from './chart';

export function ReportPieChart() {
  const { isLazyLoading, report, shareId } = useReportChartContext();
  const trpc = useTRPC();
  const { range, startDate, endDate, interval } = useOverviewOptions();

  const res = useQuery(
    trpc.chart.aggregate.queryOptions(
      {
        ...report,
        shareId,
        reportId: 'id' in report ? report.id : undefined,
        range: range ?? report.range,
        startDate: startDate ?? report.startDate,
        endDate: endDate ?? report.endDate,
        interval: interval ?? report.interval,
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
