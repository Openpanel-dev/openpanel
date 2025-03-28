import { api } from '@/trpc/client';

import { cn } from '@/utils/cn';
import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { useReportChartContext } from '../context';
import { Chart } from './chart';
import { Summary } from './summary';

export function ReportConversionChart() {
  const { isLazyLoading, report } = useReportChartContext();

  const res = api.chart.conversion.useQuery(report, {
    keepPreviousData: true,
    staleTime: 1000 * 60 * 1,
    enabled: !isLazyLoading,
  });

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

  if (res.data.current.length === 0) {
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
