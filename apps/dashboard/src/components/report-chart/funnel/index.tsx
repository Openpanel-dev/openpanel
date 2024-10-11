'use client';

import { api } from '@/trpc/client';

import type { IChartInput } from '@openpanel/validation';

import { AspectContainer } from '../aspect-container';
import { ReportChartEmpty } from '../common/empty';
import { ReportChartError } from '../common/error';
import { ReportChartLoading } from '../common/loading';
import { useReportChartContext } from '../context';
import { Chart } from './chart';

export function ReportFunnelChart() {
  const {
    report: { events, range, projectId },
    isLazyLoading,
  } = useReportChartContext();

  const input: IChartInput = {
    events,
    range,
    projectId,
    interval: 'day',
    chartType: 'funnel',
    breakdowns: [],
    previous: false,
    metric: 'sum',
  };
  const res = api.chart.funnel.useQuery(input, {
    keepPreviousData: true,
  });

  if (isLazyLoading || res.isLoading) {
    return <Loading />;
  }

  if (res.isError) {
    return <Error />;
  }

  if (res.data.current.steps.length === 0) {
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
