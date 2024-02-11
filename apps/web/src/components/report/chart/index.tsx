'use client';

import { memo } from 'react';
import type { RouterOutputs } from '@/app/_trpc/client';
import { api } from '@/app/_trpc/client';
import { useAppParams } from '@/hooks/useAppParams';
import type { IChartInput } from '@/types';

import { ChartEmpty } from './ChartEmpty';
import { withChartProivder } from './ChartProvider';
import { ReportAreaChart } from './ReportAreaChart';
import { ReportBarChart } from './ReportBarChart';
import { ReportHistogramChart } from './ReportHistogramChart';
import { ReportLineChart } from './ReportLineChart';
import { ReportMapChart } from './ReportMapChart';
import { ReportMetricChart } from './ReportMetricChart';
import { ReportPieChart } from './ReportPieChart';

export type ReportChartProps = IChartInput & {
  initialData?: RouterOutputs['chart']['chart'];
};

export const Chart = memo(
  withChartProivder(function Chart({
    interval,
    events,
    breakdowns,
    chartType,
    name,
    range,
    lineType,
    previous,
    formula,
    unit,
    metric,
    initialData,
  }: ReportChartProps) {
    const params = useAppParams();
    const [data] = api.chart.chart.useSuspenseQuery(
      {
        // dont send lineType since it does not need to be sent
        lineType: 'monotone',
        interval,
        chartType,
        events,
        breakdowns,
        name,
        range,
        startDate: null,
        endDate: null,
        projectId: params.projectId,
        previous,
        formula,
        unit,
        metric,
      },
      {
        keepPreviousData: true,
        initialData,
      }
    );

    if (data.series.length === 0) {
      return <ChartEmpty />;
    }

    if (chartType === 'map') {
      return <ReportMapChart data={data} />;
    }

    if (chartType === 'histogram') {
      return <ReportHistogramChart interval={interval} data={data} />;
    }

    if (chartType === 'bar') {
      return <ReportBarChart data={data} />;
    }

    if (chartType === 'metric') {
      return <ReportMetricChart data={data} />;
    }

    if (chartType === 'pie') {
      return <ReportPieChart data={data} />;
    }

    if (chartType === 'linear') {
      return (
        <ReportLineChart lineType={lineType} interval={interval} data={data} />
      );
    }

    if (chartType === 'area') {
      return (
        <ReportAreaChart lineType={lineType} interval={interval} data={data} />
      );
    }

    return <p>Unknown chart type</p>;
  })
);
