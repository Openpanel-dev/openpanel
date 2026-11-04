import type { IServiceEvent, IServiceSession } from '@openpanel/core';
import {
  type MetricUnit,
  OverviewMetricCard,
} from '@/components/overview/overview-metric-card';
import { cn } from '@/utils/cn';

const COLUMNS_BY_COUNT: Record<number, string> = {
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
};
const MS_PER_SECOND = 1000;

interface SessionMetric {
  key: string;
  label: string;
  value: number;
  unit: MetricUnit;
}

export function SessionMetrics({
  session,
  events,
}: {
  session: IServiceSession;
  events: IServiceEvent[];
}) {
  const pageViews = events.filter((event) => event.name === 'screen_view');
  const uniquePages = new Set(pageViews.map((event) => event.path || '/')).size;
  const durationSeconds = session.duration / MS_PER_SECOND;
  const hasPageViews = session.screenViewCount > 0;

  // The card's 'min' unit takes seconds and renders them as a duration.
  const metrics: SessionMetric[] = [
    { key: 'duration', label: 'Duration', value: durationSeconds, unit: 'min' },
    {
      key: 'screenViews',
      label: 'Page views',
      value: session.screenViewCount,
      unit: '',
    },
    { key: 'uniquePages', label: 'Unique pages', value: uniquePages, unit: '' },
    { key: 'events', label: 'Events', value: session.eventCount, unit: '' },
    ...(hasPageViews
      ? [
          {
            key: 'timePerPage',
            label: 'Time per page',
            value: durationSeconds / session.screenViewCount,
            unit: 'min' as const,
          },
        ]
      : []),
    ...(session.revenue > 0
      ? [
          {
            key: 'revenue',
            label: 'Revenue',
            value: session.revenue,
            unit: 'currency' as const,
          },
        ]
      : []),
  ];

  return (
    <div
      className={cn(
        'card grid grid-cols-2 overflow-hidden rounded-md md:grid-cols-3',
        COLUMNS_BY_COUNT[metrics.length]
      )}
    >
      {metrics.map((metric) => (
        <OverviewMetricCard
          data={[]}
          id={metric.key}
          isLoading={false}
          key={metric.key}
          label={metric.label}
          metric={{ current: metric.value, previous: null }}
          unit={metric.unit}
        />
      ))}
    </div>
  );
}
