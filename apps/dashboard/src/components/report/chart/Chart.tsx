'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/trpc/client';
import debounce from 'lodash.debounce';
import isEqual from 'lodash.isequal';

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

const pluckChartContext = (context: IChartProps) => ({
  chartType: context.chartType,
  interval: context.interval,
  breakdowns: context.breakdowns,
  range: context.range,
  previous: context.previous,
  formula: context.formula,
  metric: context.metric,
  projectId: context.projectId,
  startDate: context.startDate,
  endDate: context.endDate,
  limit: context.limit,
  offset: context.offset,
  events: context.events.map((event) => ({
    ...event,
    filters: event.filters?.filter((filter) => filter.value.length > 0),
  })),
});

// TODO: Quick hack to avoid re-fetching
//       Will refactor the entire chart component soon anyway...
function useChartData() {
  const context = useChartContext();
  const [params, setParams] = useState(() => pluckChartContext(context));
  const debouncedSetParams = useMemo(() => debounce(setParams, 500), []);

  useEffect(() => {
    const newParams = pluckChartContext(context);
    if (!isEqual(newParams, params)) {
      debouncedSetParams(newParams);
    }
    return () => {
      debouncedSetParams.cancel();
    };
  }, [context, params, debouncedSetParams]);

  return api.chart.chart.useSuspenseQuery(params, {
    keepPreviousData: true,
    staleTime: 1000 * 60 * 1,
  });
}

export function Chart() {
  const { chartType } = useChartContext();
  const [data] = useChartData();

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
