import type { IProfileMetrics } from '@openpanel/db';
import { OverviewMetricCard } from '@/components/overview/overview-metric-card';

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
    // Bounce rate for an individual profile isn't actionable (it's a
    // cohort metric), so this slot now shows total time the profile
    // has spent in session across every platform they use. `fancyMinutes`
    // formats the value as "1h 24m" / "3m 20s" automatically.
    title: 'Total Session Time',
    key: 'totalSessionDuration',
    unit: 'min',
    inverted: false,
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
    // Always show revenue even when the profile hasn't paid anything
    // yet — otherwise the tile silently disappears and it looks like
    // we've removed the metric. `$0` is legit information.
    hideOnZero: false,
  },
] as const;

export const ProfileMetrics = ({ data }: Props) => {
  return (
    <div className="relative col-span-6 -m-4 mt-0 mb-0 md:m-0">
      <div className="card grid grid-cols-2 overflow-hidden rounded-md md:grid-cols-4 lg:grid-cols-6">
        {PROFILE_METRICS.filter((metric) => {
          if (metric.hideOnZero && data[metric.key] === 0) {
            return false;
          }
          return true;
        }).map((metric) => (
          <OverviewMetricCard
            data={[]}
            id={metric.key}
            inverted={metric.inverted}
            isLoading={false}
            key={metric.key}
            label={metric.title}
            metric={{
              current:
                metric.unit === 'timeAgo' && data[metric.key]
                  ? new Date(data[metric.key]!).getTime()
                  : (data[metric.key] as number) || 0,
              previous: null,
            }}
            unit={metric.unit}
          />
        ))}
      </div>
    </div>
  );
};
