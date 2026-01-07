import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';

import type { IChartInput } from '@openpanel/validation';

import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { useReportChartContext } from '../context';
import { Chart } from './chart';

export function ReportSankeyChart() {
  const {
    report: {
      series,
      range,
      projectId,
      options,
      startDate,
      endDate,
      breakdowns,
    },
    isLazyLoading,
  } = useReportChartContext();

  if (!options) {
    return <Empty />;
  }

  const input: IChartInput = {
    series,
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
    trpc.chart.sankey.queryOptions(input, {
      enabled: !isLazyLoading && input.series.length > 0,
    }),
  );

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
