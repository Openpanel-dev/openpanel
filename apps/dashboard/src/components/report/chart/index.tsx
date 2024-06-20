'use client';

import { Suspense, useEffect, useState } from 'react';

import type { IChartProps } from '@openpanel/validation';

import { Funnel } from '../funnel';
import { Chart } from './Chart';
import { ChartLoading } from './ChartLoading';
import type { IChartContextType } from './ChartProvider';
import { ChartProvider } from './ChartProvider';
import { MetricCardLoading } from './MetricCard';

export type IChartRoot = IChartContextType;

export function ChartRoot(props: IChartContextType) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return props.chartType === 'metric' ? (
      <MetricCardLoading />
    ) : (
      <ChartLoading />
    );
  }

  return (
    <Suspense
      fallback={
        props.chartType === 'metric' ? <MetricCardLoading /> : <ChartLoading />
      }
    >
      <ChartProvider {...props}>
        {props.chartType === 'funnel' ? <Funnel /> : <Chart />}
      </ChartProvider>
    </Suspense>
  );
}

interface ChartRootShortcutProps {
  projectId: IChartProps['projectId'];
  range?: IChartProps['range'];
  previous?: IChartProps['previous'];
  chartType?: IChartProps['chartType'];
  interval?: IChartProps['interval'];
  events: IChartProps['events'];
}

export const ChartRootShortcut = ({
  projectId,
  range = '7d',
  previous = false,
  chartType = 'linear',
  interval = 'day',
  events,
}: ChartRootShortcutProps) => {
  return (
    <ChartRoot
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
