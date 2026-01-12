import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';
import { useQuery } from '@tanstack/react-query';

import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import type { IReportInput } from '@openpanel/validation';

import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { useReportChartContext } from '../context';
import { Chart, Summary, Tables } from './chart';

export function ReportFunnelChart() {
  const {
    report: {
      id,
      series,
      range,
      projectId,
      options,
      startDate,
      endDate,
      previous,
      breakdowns,
      interval,
    },
    isLazyLoading,
    shareId,
  } = useReportChartContext();
  const { range: overviewRange, startDate: overviewStartDate, endDate: overviewEndDate, interval: overviewInterval } = useOverviewOptions();

  const funnelOptions = options?.type === 'funnel' ? options : undefined;

  const trpc = useTRPC();
  const input: IReportInput = {
    series,
    range: overviewRange ?? range,
    projectId,
    interval: overviewInterval ?? interval ?? 'day',
    chartType: 'funnel',
    breakdowns,
    previous,
    metric: 'sum',
    startDate: overviewStartDate ?? startDate,
    endDate: overviewEndDate ?? endDate,
    limit: 20,
    options: funnelOptions,
  };
  const res = useQuery(
    trpc.chart.funnel.queryOptions(input, {
      enabled: !isLazyLoading && input.series.length > 0,
    }),
  );

  if (isLazyLoading || res.isLoading) {
    return <Loading />;
  }

  if (res.isError) {
    return <Error />;
  }

  if (!res.data || res.data.current.length === 0) {
    return <Empty />;
  }

  return (
    <div className="col gap-4">
      {res.data.current.length > 1 && <Summary data={res.data} />}
      <Chart data={res.data} />
      {res.data.current.map((item, index) => (
        <Tables
          key={item.id}
          data={{
            current: item,
            previous: res.data.previous?.[index] ?? null,
          }}
        />
      ))}
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
