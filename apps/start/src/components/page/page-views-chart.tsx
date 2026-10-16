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

const SERIES: OPLineChartSeries[] = [
  { dataKey: 'pageviews', label: 'Views', color: getChartColor(0) },
  {
    dataKey: 'sessions',
    label: 'Sessions',
    color: getChartColor(1),
    yAxisId: 'right',
  },
];

interface PageViewsChartProps {
  projectId: string;
  origin: string;
  path: string;
}

export function PageViewsChart({
  projectId,
  origin,
  path,
}: PageViewsChartProps) {
  const { range, interval } = useOverviewOptions();
  const trpc = useTRPC();

  const query = useQuery(
    trpc.event.pageTimeseries.queryOptions({
      projectId,
      range,
      interval,
      origin,
      path,
    })
  );

  const data = (query.data ?? []).map((row) => ({
    date: row.date,
    pageviews: row.pageviews,
    sessions: row.sessions,
  }));

  return (
    <div className="card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium text-sm">Views & Sessions</h3>
        <OPLineChartLegend series={SERIES} />
      </div>
      {query.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <OPLineChart
          data={data}
          height={CHART_HEIGHT}
          interval={interval}
          series={SERIES}
        />
      )}
    </div>
  );
}
