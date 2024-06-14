'use client';

import { api } from '@/trpc/client';

import type { IChartInput, IChartProps } from '@openpanel/validation';

import { ChartEmpty } from '../chart/ChartEmpty';
import { withChartProivder } from '../chart/ChartProvider';
import { FunnelSteps } from './Funnel';

export type ReportChartProps = IChartProps;

export const Funnel = withChartProivder(function Chart({
  events,
  range,
  projectId,
}: ReportChartProps) {
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
  const [data] = api.chart.funnel.useSuspenseQuery(input, {
    keepPreviousData: true,
  });

  if (data.current.steps.length === 0) {
    return <ChartEmpty />;
  }

  return (
    <div className="-m-4">
      <FunnelSteps {...data} input={input} />
    </div>
  );
});
