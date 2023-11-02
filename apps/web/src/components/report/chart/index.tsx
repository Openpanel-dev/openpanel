import type { IChartInput } from '@/types';
import { api } from '@/utils/api';

import { withChartProivder } from './ChartProvider';
import { ReportBarChart } from './ReportBarChart';
import { ReportLineChart } from './ReportLineChart';

type ReportLineChartProps = IChartInput;

export const Chart = withChartProivder(
  ({
    interval,
    events,
    breakdowns,
    chartType,
    name,
    range,
  }: ReportLineChartProps) => {
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
      },
      {
        keepPreviousData: true,
        enabled: events.length > 0 && !hasEmptyFilters,
      }
    );

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
  }
);
