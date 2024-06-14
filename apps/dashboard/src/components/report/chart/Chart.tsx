'use client';

import { api } from '@/trpc/client';

import type { IChartProps } from '@openpanel/validation';

import { ChartEmpty } from './ChartEmpty';
import { ReportAreaChart } from './ReportAreaChart';
import { ReportBarChart } from './ReportBarChart';
import { ReportHistogramChart } from './ReportHistogramChart';
import { ReportLineChart } from './ReportLineChart';
import { ReportMapChart } from './ReportMapChart';
import { ReportMetricChart } from './ReportMetricChart';
import { ReportPieChart } from './ReportPieChart';

export type ReportChartProps = IChartProps;

export function Chart({
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
  projectId,
  startDate,
  endDate,
}: ReportChartProps) {
  const [references] = api.reference.getChartReferences.useSuspenseQuery(
    {
      projectId,
      startDate,
      endDate,
      range,
    },
    {
      staleTime: 1000 * 60 * 5,
    }
  );

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
      <ReportLineChart
        lineType={lineType}
        interval={interval}
        data={data}
        references={references}
      />
    );
  }

  if (chartType === 'area') {
    return (
      <ReportAreaChart lineType={lineType} interval={interval} data={data} />
    );
  }

  return <p>Unknown chart type</p>;
}
