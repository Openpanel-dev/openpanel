import type { IProfileMetrics } from '@openpanel/core';
import { OverviewMetricCard } from '@/components/overview/overview-metric-card';

interface Props {
  /** `null` when nothing is known about the profile — no row and no events. */
  data: IProfileMetrics | null;
}

// The card's 'min' unit takes seconds and renders them as a duration.
// First and last seen are in the properties list next to this.
const PROFILE_METRICS = [
  {
    title: 'Sessions',
    key: 'sessions',
    unit: '',
    inverted: false,
    hideOnZero: false,
  },
  {
    title: 'Events',
    key: 'totalEvents',
    unit: '',
    inverted: false,
    hideOnZero: false,
  },
  {
    title: 'Page views',
    key: 'screenViews',
    unit: '',
    inverted: false,
    hideOnZero: false,
  },
  {
    title: 'Avg session',
    key: 'durationAvg',
    unit: 'min',
    inverted: false,
    hideOnZero: false,
  },
  {
    title: 'Days active',
    key: 'uniqueDaysActive',
    unit: '',
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
  {
    title: 'Bounce rate',
    key: 'bounceRate',
    unit: '%',
    inverted: true,
    hideOnZero: false,
  },
] as const;
const VISIBLE_METRICS = 6;

export const ProfileMetrics = ({ data }: Props) => {
  if (!data) {
    return null;
  }

  return (
    <div className="card grid grid-cols-2 overflow-hidden rounded-md md:grid-cols-3">
      {PROFILE_METRICS.filter(
        (metric) => !(metric.hideOnZero && data[metric.key] === 0)
      )
        .slice(0, VISIBLE_METRICS)
        .map((metric) => (
          <OverviewMetricCard
            data={[]}
            id={metric.key}
            inverted={metric.inverted}
            isLoading={false}
            key={metric.key}
            label={metric.title}
            metric={{
              current: data[metric.key] || 0,
              previous: null,
            }}
            unit={metric.unit}
          />
        ))}
    </div>
  );
};
