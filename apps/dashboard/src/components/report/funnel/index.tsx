'use client';

import type { RouterOutputs } from '@/trpc/client';
import { api } from '@/trpc/client';

import type { IChartInput } from '@openpanel/validation';

import { ChartEmpty } from '../chart/ChartEmpty';
import { withChartProivder } from '../chart/ChartProvider';
import { FunnelSteps } from './Funnel';

export type ReportChartProps = IChartInput & {
  initialData?: RouterOutputs['chart']['funnel'];
};

export const Funnel = withChartProivder(function Chart({
  events,
  name,
  range,
  projectId,
}: ReportChartProps) {
  const [data] = api.chart.funnel.useSuspenseQuery(
    {
      events,
      name,
      range,
      projectId,
      lineType: 'monotone',
      interval: 'day',
      chartType: 'funnel',
      breakdowns: [],
      startDate: null,
      endDate: null,
      previous: false,
      formula: undefined,
      unit: undefined,
      metric: 'sum',
    },
    {
      keepPreviousData: true,
    }
  );

  if (data.steps.length === 0) {
    return <ChartEmpty />;
  }

  return (
    <div className="-mx-4">
      <FunnelSteps {...data} />
    </div>
  );
});
