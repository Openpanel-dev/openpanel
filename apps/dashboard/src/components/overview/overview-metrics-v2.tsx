'use client';

import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';

import { api } from '@/trpc/client';
import { OverviewLiveHistogram } from './overview-live-histogram';
import { OverviewMetricCard } from './overview-metric-card';

interface OverviewMetricsProps {
  projectId: string;
}

export default function OverviewMetricsV2({ projectId }: OverviewMetricsProps) {
  const { previous, range, interval, metric, setMetric, startDate, endDate } =
    useOverviewOptions();
  const [filters] = useEventQueryFilters();

  const overviewQuery = api.overview.stats.useQuery({
    projectId,
    range,
    interval,
    filters,
  });

  const data = overviewQuery.data;

  return (
    <>
      <div className="relative -top-0.5 col-span-6 -m-4 mb-0 mt-0 md:m-0">
        <div className="card mb-2 grid grid-cols-4 overflow-hidden rounded-md">
          <OverviewMetricCard
            label="Unique Visitors"
            data={data ?? []}
            dataKey="unique_visitors"
            summary="sum"
          />
          <OverviewMetricCard
            label="Sessions"
            data={data ?? []}
            dataKey="total_sessions"
            summary="sum"
          />
          <OverviewMetricCard
            label="Pageviews"
            data={data ?? []}
            dataKey="total_screen_views"
            summary="sum"
          />
          <OverviewMetricCard
            label="Pages per session"
            data={data ?? []}
            dataKey="views_per_session"
            summary="avg"
          />
          <OverviewMetricCard
            label="Bounce Rate"
            unit="%"
            data={data ?? []}
            dataKey="bounce_rate"
            summary="avg"
          />
          <OverviewMetricCard
            label="Avg. Session Duration"
            unit="min"
            data={data ?? []}
            dataKey="avg_session_duration"
            summary="avg"
          />
          <div
            className={cn(
              'col-span-4 min-h-16 flex-1 p-4 pb-0 shadow-[0_0_0_0.5px] shadow-border max-md:row-start-1 md:col-span-2',
            )}
          >
            <OverviewLiveHistogram projectId={projectId} />
          </div>
        </div>
        <div className="card col-span-6 p-4">
          {/* <ReportChart
            key={selectedMetric.id}
            options={{
              hideID: true,
              maxDomain: selectedMetric.maxDomain,
              aspectRatio: 0.2,
              hideLegend: true,
            }}
            report={{
              ...selectedMetric,
              chartType: 'linear',
              lineType: 'linear',
            }}
          /> */}
        </div>
      </div>
    </>
  );
}
