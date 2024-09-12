import { api } from '@/trpc/client';

import { useReportChartContext } from '../context';
import { Chart } from './chart';

export function ReportMetricChart() {
  const { isLazyLoading, report } = useReportChartContext();

  const res = api.chart.chart.useQuery(report, {
    keepPreviousData: true,
    staleTime: 1000 * 60 * 1,
  });

  if (isLazyLoading || res.isLoading || res.isFetching) {
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

export function Loading() {
  return (
    <div className="flex h-[78px] flex-col justify-between p-4">
      <div className="h-3 w-1/2 animate-pulse rounded bg-def-200"></div>
      <div className="row items-end justify-between">
        <div className="h-6 w-1/3 animate-pulse rounded bg-def-200"></div>
        <div className="h-3 w-1/5 animate-pulse rounded bg-def-200"></div>
      </div>
    </div>
  );
}

export function Error() {
  return (
    <div className="relative h-[70px]">
      <div className="opacity-50">
        <Loading />
      </div>
      <div className="center-center absolute inset-0 text-muted-foreground">
        <div className="text-sm font-medium">Error fetching data</div>
      </div>
    </div>
  );
}

export function Empty() {
  return (
    <div className="relative h-[70px]">
      <div className="opacity-50">
        <Loading />
      </div>
      <div className="center-center absolute inset-0 text-muted-foreground">
        <div className="text-sm font-medium">No data</div>
      </div>
    </div>
  );
}
