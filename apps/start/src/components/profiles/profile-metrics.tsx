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
  },
  {
    title: 'Sessions',
    key: 'sessions',
    unit: '',
    inverted: false,
  },
  {
    title: 'Page Views',
    key: 'screenViews',
    unit: '',
    inverted: false,
  },
  {
    title: 'Avg Events/Session',
    key: 'avgEventsPerSession',
    unit: '',
    inverted: false,
  },
  {
    title: 'Bounce Rate',
    key: 'bounceRate',
    unit: '%',
    inverted: true,
  },
  {
    title: 'Session Duration (Avg)',
    key: 'durationAvg',
    unit: 'min',
    inverted: false,
  },
  {
    title: 'Session Duration (P90)',
    key: 'durationP90',
    unit: 'min',
    inverted: false,
  },
  {
    title: 'First seen',
    key: 'firstSeen',
    unit: 'timeAgo',
    inverted: false,
  },
  {
    title: 'Last seen',
    key: 'lastSeen',
    unit: 'timeAgo',
    inverted: false,
  },
  {
    title: 'Days Active',
    key: 'uniqueDaysActive',
    unit: '',
    inverted: false,
  },
  {
    title: 'Conversion Events',
    key: 'conversionEvents',
    unit: '',
    inverted: false,
  },
  {
    title: 'Avg Time Between Sessions (h)',
    key: 'avgTimeBetweenSessions',
    unit: 'min',
    inverted: false,
  },
] as const;

export const ProfileMetrics = ({ data }: Props) => {
  return (
    <div className="relative col-span-6 -m-4 mb-0 mt-0 md:m-0">
      <div className="card grid grid-cols-2 overflow-hidden rounded-md md:grid-cols-4 lg:grid-cols-6">
        {PROFILE_METRICS.map((metric) => (
          <OverviewMetricCard
            key={metric.key}
            id={metric.key}
            label={metric.title}
            metric={{
              current:
                metric.unit === 'timeAgo' &&
                typeof data[metric.key] === 'string'
                  ? new Date(data[metric.key] as string).getTime()
                  : (data[metric.key] as number) || 0,
              previous: null, // Profile metrics don't have previous period comparison
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
