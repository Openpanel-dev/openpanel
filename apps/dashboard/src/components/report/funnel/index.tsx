'use client';

import { api } from '@/trpc/client';

import type { IChartInput } from '@openpanel/validation';

import { ChartEmpty } from '../chart/ChartEmpty';
import { useChartContext } from '../chart/ChartProvider';
import { FunnelSteps } from './Funnel';

export function Funnel() {
  const { events, range, projectId } = useChartContext();

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
}
