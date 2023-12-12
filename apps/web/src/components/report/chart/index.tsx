import { memo } from 'react';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import type { IChartInput } from '@/types';
import { api } from '@/utils/api';

import { ChartAnimation, ChartAnimationContainer } from './ChartAnimation';
import { withChartProivder } from './ChartProvider';
import { ReportBarChart } from './ReportBarChart';
import { ReportLineChart } from './ReportLineChart';

export type ReportChartProps = IChartInput;

export const Chart = memo(
  withChartProivder(function Chart({
    interval,
    events,
    breakdowns,
    chartType,
    name,
    range,
  }: ReportChartProps) {
    const params = useOrganizationParams();
    const hasEmptyFilters = events.some((event) =>
      event.filters.some((filter) => filter.value.length === 0)
    );
    const enabled = events.length > 0 && !hasEmptyFilters;
    const chart = api.chart.chart.useQuery(
      {
        interval,
        chartType,
        events,
        breakdowns,
        name,
        range,
        startDate: null,
        endDate: null,
        projectSlug: params.project,
      },
      {
        keepPreviousData: false,
        enabled,
      }
    );

    const anyData = Boolean(chart.data?.series?.[0]?.data);

    if (!enabled) {
      return (
        <ChartAnimationContainer>
          <ChartAnimation name="ballon" className="w-96 mx-auto" />
          <p className="text-center font-medium">
            Please select at least one event to see the chart.
          </p>
        </ChartAnimationContainer>
      );
    }

    if (chart.isFetching) {
      return (
        <ChartAnimationContainer>
          <ChartAnimation name="airplane" className="w-96 mx-auto" />
          <p className="text-center font-medium">Loading...</p>
        </ChartAnimationContainer>
      );
    }

    if (chart.isError) {
      return (
        <ChartAnimationContainer>
          <ChartAnimation name="noData" className="w-96 mx-auto" />
          <p className="text-center font-medium">Something went wrong...</p>
        </ChartAnimationContainer>
      );
    }

    if (!chart.isSuccess) {
      return <ChartAnimation name="ballon" className="w-96 mx-auto" />;
    }

    if (!anyData) {
      return (
        <ChartAnimationContainer>
          <ChartAnimation name="noData" className="w-96 mx-auto" />
          <p className="text-center font-medium">No data</p>
        </ChartAnimationContainer>
      );
    }

    if (chartType === 'bar') {
      return <ReportBarChart data={chart.data} />;
    }

    if (chartType === 'linear') {
      return <ReportLineChart interval={interval} data={chart.data} />;
    }

    return (
      <ChartAnimationContainer>
        <ChartAnimation name="ballon" className="w-96 mx-auto" />
        <p className="text-center font-medium">
          Chart type &quot;{chartType}&quot; is not supported yet.
        </p>
      </ChartAnimationContainer>
    );
  })
);
