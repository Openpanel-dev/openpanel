'use client';

import { Suspense, useEffect, useState } from 'react';
import * as Portal from '@radix-ui/react-portal';

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
      <ChartLoading aspectRatio={props.aspectRatio} />
    );
  }

  return (
    <Suspense
      fallback={
        props.chartType === 'metric' ? (
          <MetricCardLoading />
        ) : (
          <ChartLoading aspectRatio={props.aspectRatio} />
        )
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
  breakdowns?: IChartProps['breakdowns'];
  lineType?: IChartProps['lineType'];
  hideXAxis?: boolean;
  aspectRatio?: number;
}

export const ChartRootShortcut = ({
  hideXAxis,
  projectId,
  range = '7d',
  previous = false,
  chartType = 'linear',
  interval = 'day',
  events,
  breakdowns,
  aspectRatio,
  lineType = 'monotone',
}: ChartRootShortcutProps) => {
  return (
    <Portal.Root>
      <ChartRoot
        projectId={projectId}
        range={range}
        breakdowns={breakdowns ?? []}
        previous={previous}
        chartType={chartType}
        interval={interval}
        name="Random"
        lineType={lineType}
        metric="sum"
        events={events}
        aspectRatio={aspectRatio}
        hideXAxis={hideXAxis}
      />
    </Portal.Root>
  );
};
