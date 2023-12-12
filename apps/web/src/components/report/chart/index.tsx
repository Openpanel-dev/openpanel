import { memo } from 'react';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import type { IChartInput } from '@/types';
import { api } from '@/utils/api';

import { ChartAnimation } from './ChartAnimation';
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
      return <p>Select events & filters to begin</p>;
    }

    if (chart.isFetching) {
      return <ChartAnimation name="airplane" className="w-96 mx-auto" />;
    }

    if (chart.isError) {
      return <p>Error</p>;
    }

    if (!chart.isSuccess) {
      return <ChartAnimation name="ballon" className="w-96 mx-auto" />;
    }

    if (!anyData) {
      return <ChartAnimation name="ballon" className="w-96 mx-auto" />;
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
