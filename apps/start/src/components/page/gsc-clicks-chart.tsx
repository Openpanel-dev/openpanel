import { useQuery } from '@tanstack/react-query';
import {
  OPLineChart,
  OPLineChartLegend,
  type OPLineChartSeries,
} from '@/components/charts/op-line-chart';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { Skeleton } from '@/components/skeleton';
import { useTRPC } from '@/integrations/trpc/react';
import { getChartColor } from '@/utils/theme';

const CHART_HEIGHT = 160;

export const GSC_CLICKS_SERIES: OPLineChartSeries[] = [
  { dataKey: 'clicks', label: 'Clicks', color: getChartColor(0) },
  {
    dataKey: 'impressions',
    label: 'Impressions',
    color: getChartColor(1),
    yAxisId: 'right',
  },
];

interface GscClicksChartProps {
  projectId: string;
  value: string;
  type: 'page' | 'query';
}

export function GscClicksChart({
  projectId,
  value,
  type,
}: GscClicksChartProps) {
  const { range, startDate, endDate, interval } = useOverviewOptions();
  const trpc = useTRPC();

  const dateInput = {
    range,
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined,
  };

  const pageQuery = useQuery(
    trpc.gsc.getPageDetails.queryOptions(
      { projectId, page: value, ...dateInput },
      { enabled: type === 'page' }
    )
  );

  const queryQuery = useQuery(
    trpc.gsc.getQueryDetails.queryOptions(
      { projectId, query: value, ...dateInput },
      { enabled: type === 'query' }
    )
  );

  const isLoading =
    type === 'page' ? pageQuery.isLoading : queryQuery.isLoading;
  const timeseries =
    (type === 'page'
      ? pageQuery.data?.timeseries
      : queryQuery.data?.timeseries) ?? [];

  const data = timeseries.map((row) => ({
    date: row.date,
    clicks: row.clicks,
    impressions: row.impressions,
  }));

  return (
    <div className="card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium text-sm">Clicks & Impressions</h3>
        <OPLineChartLegend series={GSC_CLICKS_SERIES} />
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <OPLineChart
          data={data}
          height={CHART_HEIGHT}
          interval={interval}
          series={GSC_CLICKS_SERIES}
        />
      )}
    </div>
  );
}
