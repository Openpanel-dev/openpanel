import { memo } from 'react';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import type { IChartInput } from '@/types';
import { api } from '@/utils/api';

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
        keepPreviousData: true,
        enabled: events.length > 0 && !hasEmptyFilters,
      }
    );

    console.log(chart.data);

    const anyData = Boolean(chart.data?.series?.[0]?.data);

    if (chart.isFetching && !anyData) {
      return <p>Loading...</p>;
    }

    if (chart.isError) {
      return <p>Error</p>;
    }

    if (!chart.isSuccess) {
      return <p>Loading...</p>;
    }

    if (!anyData) {
      return <p>No data</p>;
    }

    if (chartType === 'bar') {
      return <ReportBarChart data={chart.data} />;
    }

    if (chartType === 'linear') {
      return <ReportLineChart interval={interval} data={chart.data} />;
    }

    return <p>Chart type &quot;{chartType}&quot; is not supported yet.</p>;
  })
);
