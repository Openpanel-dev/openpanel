'use client';

import { type RouterOutputs, api } from '@/trpc/client';

import type { IChartInput } from '@openpanel/validation';

import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { useReportChartContext } from '../context';
import { Chart, Summary, Tables } from './chart';

export function ReportFunnelChart() {
  const {
    report: {
      events,
      range,
      projectId,
      funnelWindow,
      funnelGroup,
      startDate,
      endDate,
      previous,
      breakdowns,
    },
    isLazyLoading,
  } = useReportChartContext();

  const input: IChartInput = {
    events,
    range,
    projectId,
    interval: 'day',
    chartType: 'funnel',
    breakdowns,
    funnelWindow,
    funnelGroup,
    previous,
    metric: 'sum',
    startDate,
    endDate,
  };
  const res = api.chart.funnel.useQuery(input, {
    enabled: !isLazyLoading,
  });

  if (isLazyLoading || res.isLoading) {
    return <Loading />;
  }

  if (res.isError) {
    return <Error />;
  }

  if (res.data.current.length === 0) {
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
