'use client';

import type { IChartInput } from '@mixan/validation';

import { Funnel } from '../funnel';
import { Chart } from './Chart';
import { withChartProivder } from './ChartProvider';

export type ReportChartProps = IChartInput;

export const ChartSwitch = withChartProivder(function ChartSwitch(
  props: ReportChartProps
) {
  if (props.chartType === 'funnel') {
    return <Funnel {...props} />;
  }

  return <Chart {...props} />;
});

interface ChartSwitchShortcutProps {
  projectId: ReportChartProps['projectId'];
  range?: ReportChartProps['range'];
  previous?: ReportChartProps['previous'];
  chartType?: ReportChartProps['chartType'];
  interval?: ReportChartProps['interval'];
  events: ReportChartProps['events'];
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
