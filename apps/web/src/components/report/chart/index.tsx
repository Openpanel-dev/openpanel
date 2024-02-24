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
