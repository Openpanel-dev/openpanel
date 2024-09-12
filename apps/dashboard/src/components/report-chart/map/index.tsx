import { api } from '@/trpc/client';

import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { useReportChartContext } from '../context';
import { Chart } from './chart';

export function ReportMapChart() {
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
