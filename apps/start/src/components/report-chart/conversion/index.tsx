import { useTRPC } from '@/integrations/trpc/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { cn } from '@/utils/cn';
import { AspectContainer } from '../aspect-container';
import { ChartDownloadButton } from '../common/chart-download-button';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { RefetchingOverlay } from '../common/refetching-overlay';
import { useReportChartContext } from '../context';
import { Chart } from './chart';
import { Summary } from './summary';

export function ReportConversionChart() {
  const { isLazyLoading, report, isEditMode, options } =
    useReportChartContext();
  const trpc = useTRPC();
  const res = useQuery(
    trpc.chart.conversion.queryOptions(report, {
      placeholderData: keepPreviousData,
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
    <div className={cn('relative group/chart', options?.fillHeight && 'h-full')}>
      <RefetchingOverlay isRefetching={res.isPlaceholderData && res.isFetching} />
      <ChartDownloadButton type="conversion" data={res.data} />
      {isEditMode && <Summary data={res.data} />}
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
