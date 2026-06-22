import type { IProfileMetrics } from '@openpanel/db';
import { OverviewMetricCard } from '@/components/overview/overview-metric-card';
import { useTranslation } from 'react-i18next';

type Props = {
  data: IProfileMetrics;
};

const PROFILE_METRICS = [
  {
    labelKey: 'profiles.metric_total_events',
    key: 'totalEvents',
    unit: '',
    inverted: false,
    hideOnZero: false,
  },
  {
    labelKey: 'profiles.metric_sessions',
    key: 'sessions',
    unit: '',
    inverted: false,
    hideOnZero: false,
  },
  {
    labelKey: 'profiles.metric_page_views',
    key: 'screenViews',
    unit: '',
    inverted: false,
    hideOnZero: false,
  },
  {
    labelKey: 'profiles.metric_avg_events_per_session',
    key: 'avgEventsPerSession',
    unit: '',
    inverted: false,
    hideOnZero: false,
  },
  {
    labelKey: 'profiles.metric_bounce_rate',
    key: 'bounceRate',
    unit: '%',
    inverted: true,
    hideOnZero: false,
  },
  {
    labelKey: 'profiles.metric_session_duration_avg',
    key: 'durationAvg',
    unit: 'min',
    inverted: false,
    hideOnZero: false,
  },
  {
    labelKey: 'profiles.metric_session_duration_p90',
    key: 'durationP90',
    unit: 'min',
    inverted: false,
    hideOnZero: false,
  },
  {
    labelKey: 'profiles.metric_first_seen',
    key: 'firstSeen',
    unit: 'timeAgo',
    inverted: false,
    hideOnZero: false,
  },
  {
    labelKey: 'profiles.metric_last_seen',
    key: 'lastSeen',
    unit: 'timeAgo',
    inverted: false,
    hideOnZero: false,
  },
  {
    labelKey: 'profiles.metric_days_active',
    key: 'uniqueDaysActive',
    unit: '',
    inverted: false,
    hideOnZero: false,
  },
  {
    labelKey: 'profiles.metric_conversion_events',
    key: 'conversionEvents',
    unit: '',
    inverted: false,
    hideOnZero: false,
  },
  {
    labelKey: 'profiles.metric_avg_time_between_sessions',
    key: 'avgTimeBetweenSessions',
    unit: 'min',
    inverted: false,
    hideOnZero: false,
  },
  {
    labelKey: 'profiles.metric_revenue',
    key: 'revenue',
    unit: 'currency',
    inverted: false,
    hideOnZero: true,
  },
] as const;

export const ProfileMetrics = ({ data }: Props) => {
  const { t } = useTranslation();
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
            label={t(metric.labelKey)}
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
