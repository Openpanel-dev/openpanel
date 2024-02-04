'use client';

import { memo } from 'react';
import type { RouterOutputs } from '@/app/_trpc/client';
import { api } from '@/app/_trpc/client';
import { useAppParams } from '@/hooks/useAppParams';
import type { IChartInput } from '@/types';

import { ChartAnimation, ChartAnimationContainer } from './ChartAnimation';
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
    const hasEmptyFilters = events.some((event) =>
      event.filters.some((filter) => filter.value.length === 0)
    );
    const enabled = events.length > 0 && !hasEmptyFilters;

    const chart = api.chart.chart.useQuery(
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
        enabled,
        initialData,
      }
    );

    const anyData = Boolean(chart.data?.series?.[0]?.data);

    if (!enabled) {
      return (
        <ChartAnimationContainer>
          <ChartAnimation name="ballon" className="max-w-sm w-fill mx-auto" />
          <p className="text-center font-medium">
            Please select at least one event to see the chart.
          </p>
        </ChartAnimationContainer>
      );
    }

    if (chart.isLoading) {
      return (
        <ChartAnimationContainer>
          {/* <ChartAnimation name="airplane" className="max-w-sm w-fill mx-auto" /> */}
          <p className="text-center font-medium">Loading...</p>
        </ChartAnimationContainer>
      );
    }

    if (chart.isError) {
      return (
        <ChartAnimationContainer>
          <ChartAnimation name="noData" className="max-w-sm w-fill mx-auto" />
          <p className="text-center font-medium">Something went wrong...</p>
        </ChartAnimationContainer>
      );
    }

    if (!chart.isSuccess) {
      return (
        <ChartAnimation name="ballon" className="max-w-sm w-fill mx-auto" />
      );
    }

    if (!anyData) {
      return (
        <ChartAnimationContainer>
          <ChartAnimation name="noData" className="max-w-sm w-fill mx-auto" />
          <p className="text-center font-medium">No data</p>
        </ChartAnimationContainer>
      );
    }

    if (chartType === 'map') {
      return <ReportMapChart data={chart.data} />;
    }

    if (chartType === 'histogram') {
      return <ReportHistogramChart interval={interval} data={chart.data} />;
    }

    if (chartType === 'bar') {
      return <ReportBarChart data={chart.data} />;
    }

    if (chartType === 'metric') {
      return <ReportMetricChart data={chart.data} />;
    }

    if (chartType === 'pie') {
      return <ReportPieChart data={chart.data} />;
    }

    if (chartType === 'linear') {
      return (
        <ReportLineChart
          lineType={lineType}
          interval={interval}
          data={chart.data}
        />
      );
    }

    if (chartType === 'area') {
      return (
        <ReportAreaChart
          lineType={lineType}
          interval={interval}
          data={chart.data}
        />
      );
    }

    return (
      <ChartAnimationContainer>
        <ChartAnimation name="ballon" className="max-w-sm w-fill mx-auto" />
        <p className="text-center font-medium">
          Chart type &quot;{chartType}&quot; is not supported yet.
        </p>
      </ChartAnimationContainer>
    );
  })
);
