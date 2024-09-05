'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/trpc/client';
import debounce from 'lodash.debounce';

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

function useChartData() {
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

  const [debouncedParams, setDebouncedParams] = useState({
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
  });

  const debouncedSetParams = useMemo(
    () => debounce(setDebouncedParams, 500),
    []
  );

  useEffect(() => {
    debouncedSetParams({
      interval,
      events: events.map((event) => ({
        ...event,
        filters: event.filters?.filter((filter) => filter.value.length > 0),
      })),
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
    });
    return () => {
      debouncedSetParams.cancel();
    };
  }, [
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
    debouncedSetParams,
  ]);

  const [data] = api.chart.chart.useSuspenseQuery(debouncedParams, {
    keepPreviousData: true,
    staleTime: 1000 * 60 * 1,
  });

  return data;
}

export function Chart() {
  const { chartType } = useChartContext();
  const data = useChartData();

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
