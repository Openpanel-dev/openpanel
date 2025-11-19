import { OverviewMetricCard } from '@/components/overview/overview-metric-card';

import type { IProfileMetrics } from '@openpanel/db';

type Props = {
  data: IProfileMetrics;
};

const PROFILE_METRICS = [
  {
    title: 'Total Events',
    key: 'totalEvents',
    unit: '',
    inverted: false,
    hideOnZero: false,
  },
  {
    title: 'Sessions',
    key: 'sessions',
    unit: '',
    inverted: false,
    hideOnZero: false,
  },
  {
    title: 'Page Views',
    key: 'screenViews',
    unit: '',
    inverted: false,
    hideOnZero: false,
  },
  {
    title: 'Avg Events/Session',
    key: 'avgEventsPerSession',
    unit: '',
    inverted: false,
    hideOnZero: false,
  },
  {
    title: 'Bounce Rate',
    key: 'bounceRate',
    unit: '%',
    inverted: true,
    hideOnZero: false,
  },
  {
    title: 'Session Duration (Avg)',
    key: 'durationAvg',
    unit: 'min',
    inverted: false,
    hideOnZero: false,
  },
  {
    title: 'Session Duration (P90)',
    key: 'durationP90',
    unit: 'min',
    inverted: false,
    hideOnZero: false,
  },
  {
    title: 'First seen',
    key: 'firstSeen',
    unit: 'timeAgo',
    inverted: false,
    hideOnZero: false,
  },
  {
    title: 'Last seen',
    key: 'lastSeen',
    unit: 'timeAgo',
    inverted: false,
    hideOnZero: false,
  },
  {
    title: 'Days Active',
    key: 'uniqueDaysActive',
    unit: '',
    inverted: false,
    hideOnZero: false,
  },
  {
    title: 'Conversion Events',
    key: 'conversionEvents',
    unit: '',
    inverted: false,
    hideOnZero: false,
  },
  {
    title: 'Avg Time Between Sessions (h)',
    key: 'avgTimeBetweenSessions',
    unit: 'min',
    inverted: false,
    hideOnZero: false,
  },
  {
    title: 'Revenue',
    key: 'revenue',
    unit: 'currency',
    inverted: false,
    hideOnZero: true,
  },
] as const;

export const ProfileMetrics = ({ data }: Props) => {
  return (
    <div className="relative col-span-6 -m-4 mb-0 mt-0 md:m-0">
      <div className="card grid grid-cols-2 overflow-hidden rounded-md md:grid-cols-4 lg:grid-cols-6">
        {PROFILE_METRICS.filter((metric) => {
          if (metric.hideOnZero && data[metric.key] === 0) {
            return false;
          }
          return true;
        }).map((metric) => (
          <OverviewMetricCard
            key={metric.key}
            id={metric.key}
            label={metric.title}
            metric={{
              current:
                metric.unit === 'timeAgo'
                  ? new Date(data[metric.key]).getTime()
                  : (data[metric.key] as number) || 0,
              previous: null,
            }}
            unit={metric.unit}
            data={[]}
            inverted={metric.inverted}
            isLoading={false}
          />
        ))}
      </div>
    </div>
  );
};
