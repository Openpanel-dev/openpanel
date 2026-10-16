import type { IReportInput } from '@openpanel/core/modules/report/report.constants';
import { useQuery } from '@tanstack/react-query';
import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { useReportChartContext } from '../context';
import { Chart } from './chart';
import { useTRPC } from '@/integrations/trpc/react';

export function ReportSankeyChart() {
  const {
    report: {
      series,
      globalFilters,
      range,
      projectId,
      options,
      startDate,
      endDate,
      breakdowns,
      id,
    },
    isLazyLoading,
    shareId,
  } = useReportChartContext();

  const input: IReportInput = {
    series,
    globalFilters,
    range,
    projectId,
    interval: 'day',
    chartType: 'sankey',
    breakdowns,
    options,
    metric: 'sum',
    startDate,
    endDate,
    limit: 20,
    previous: false,
  };
  const trpc = useTRPC();
  const res = useQuery(
    trpc.chart.sankey.queryOptions(
      { ...input, id, shareId },
      {
        enabled: !isLazyLoading && !!options && input.series.length > 0,
      }
    )
  );

  if (!options) {
    return <Empty />;
  }

  if (isLazyLoading || res.isLoading) {
    return <Loading />;
  }

  if (res.isError) {
    return <Error />;
  }

  if (!res.data || res.data.nodes.length === 0) {
    return <Empty />;
  }

  return (
    <div className="col gap-4">
      <Chart data={res.data} />
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
