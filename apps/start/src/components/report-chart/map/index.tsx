import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';

import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { useReportChartContext } from '../context';
import { Chart } from './chart';

export function ReportMapChart() {
  const { isLazyLoading, report } = useReportChartContext();
  const trpc = useTRPC();

  const res = useQuery(
    trpc.chart.chart.queryOptions(report, {
      keepPreviousData: true,
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

  if (res.data.series.length === 0) {
    return <Empty />;
  }

  return <Chart data={res.data} />;
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
