import { api } from '@/trpc/client';

import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { useReportChartContext } from '../context';
import { Chart } from './chart';

export function ReportBarChart() {
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

function Loading() {
  return (
    <AspectContainer className="col gap-4 overflow-hidden">
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={index} className="row animate-pulse justify-between">
          <div className="h-4 w-2/5 rounded bg-def-200"></div>
          <div className="row w-1/5 gap-2">
            <div className="h-4 w-full rounded bg-def-200"></div>
            <div className="h-4 w-full rounded bg-def-200"></div>
            <div className="h-4 w-full rounded bg-def-200"></div>
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
