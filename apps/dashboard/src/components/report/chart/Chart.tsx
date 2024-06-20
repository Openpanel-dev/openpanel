'use client';

import { api } from '@/trpc/client';

import type { IChartProps } from '@openpanel/validation';

import { ChartEmpty } from './ChartEmpty';
import { useChartContext } from './ChartProvider';
import { ReportAreaChart } from './ReportAreaChart';
import { ReportBarChart } from './ReportBarChart';
import { ReportHistogramChart } from './ReportHistogramChart';
import { ReportLineChart } from './ReportLineChart';
import { ReportMapChart } from './ReportMapChart';
import { ReportMetricChart } from './ReportMetricChart';
import { ReportPieChart } from './ReportPieChart';

export type ReportChartProps = IChartProps;

export function Chart() {
  const {
    interval,
    events,
    breakdowns,
    chartType,
    range,
    previous,
    formula,
    metric,
    projectId,
    startDate,
    endDate,
    limit,
    offset,
  } = useChartContext();
  const [data] = api.chart.chart.useSuspenseQuery(
    {
      interval,
      chartType,
      events,
      breakdowns,
      range,
      startDate,
      endDate,
      projectId,
      previous,
      formula,
      metric,
      limit,
      offset,
    },
    {
      keepPreviousData: true,
    }
  );

  if (data.series.length === 0) {
    return <ChartEmpty />;
  }

  if (chartType === 'map') {
    return <ReportMapChart data={data} />;
  }

  if (chartType === 'histogram') {
    return <ReportHistogramChart data={data} />;
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
    return <ReportLineChart data={data} />;
  }

  if (chartType === 'area') {
    return <ReportAreaChart data={data} />;
  }

  return <p>Unknown chart type</p>;
}
