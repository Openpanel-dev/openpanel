'use client';

import type { IChartProps } from '@openpanel/validation';

import { Funnel } from '../funnel';
import { Chart } from './Chart';
import { withChartProivder } from './ChartProvider';

export const ChartSwitch = withChartProivder(function ChartSwitch(
  props: IChartProps
) {
  if (props.chartType === 'funnel') {
    return <Funnel {...props} />;
  }

  return <Chart {...props} />;
});

interface ChartSwitchShortcutProps {
  projectId: IChartProps['projectId'];
  range?: IChartProps['range'];
  previous?: IChartProps['previous'];
  chartType?: IChartProps['chartType'];
  interval?: IChartProps['interval'];
  events: IChartProps['events'];
}

export const ChartSwitchShortcut = ({
  projectId,
  range = '7d',
  previous = false,
  chartType = 'linear',
  interval = 'day',
  events,
}: ChartSwitchShortcutProps) => {
  return (
    <ChartSwitch
      projectId={projectId}
      range={range}
      breakdowns={[]}
      previous={previous}
      chartType={chartType}
      interval={interval}
      name="Random"
      lineType="bump"
      metric="sum"
      events={events}
    />
  );
};
