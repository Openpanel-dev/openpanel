import type { IInterval } from '@openpanel/validation';
import { useQuery } from '@tanstack/react-query';
import { curveMonotoneX } from '@visx/curve';
import { DollarSignIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Area } from '../charts/area';
import { ComposedChart } from '../charts/composed-chart';
import { Grid } from '../charts/grid';
import { Line } from '../charts/line';
import { useDashedTail } from '../charts/op-dashed-tail';
import { OPDatePill } from '../charts/op-date-pill';
import { OPReferences } from '../charts/op-references';
import { OPReferrerSpikes } from '../charts/op-referrer-spikes';
import { OPSeriesDots } from '../charts/op-series-dots';
import { OPChartTooltip } from '../charts/op-tooltip';
import { XAxis } from '../charts/x-axis';
import { YAxis } from '../charts/y-axis';
import { Skeleton } from '../skeleton';
import { OverviewLiveHistogram } from './overview-live-histogram';
import { OverviewMetricCard } from './overview-metric-card';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

interface OverviewMetricsProps {
  projectId: string;
  shareId?: string;
}

// Softer than --chart-8's electric emerald, still clearly "green = money".
const REVENUE_COLOR = 'oklch(0.68 0.11 158)';
// Bump alpha (0.2 → 0.4) so the bklit hover highlight — which inherits the
// line's stroke color — has enough body to be perceptible on hover.
const PREV_LINE_COLOR = 'oklch(from var(--foreground) l c h / 0.4)';

const TITLES = [
  {
    title: 'Unique Visitors',
    key: 'unique_visitors',
    unit: '',
    inverted: false,
  },
  {
    title: 'Sessions',
    key: 'total_sessions',
    unit: '',
    inverted: false,
  },
  {
    title: 'Pageviews',
    key: 'total_screen_views',
    unit: '',
    inverted: false,
  },
  {
    title: 'Pages per session',
    key: 'views_per_session',
    unit: '',
    inverted: false,
  },
  {
    title: 'Bounce Rate',
    key: 'bounce_rate',
    unit: '%',
    inverted: true,
  },
  {
    title: 'Session Duration',
    key: 'avg_session_duration',
    unit: 'min',
    inverted: false,
  },
  {
    title: 'Revenue',
    key: 'total_revenue',
    unit: 'currency',
    inverted: false,
  },
] as const;

export default function OverviewMetrics({
  projectId,
  shareId,
}: OverviewMetricsProps) {
  const { range, interval, metric, setMetric, startDate, endDate } =
    useOverviewOptions();
  const [filters] = useEventQueryFilters();
  const trpc = useTRPC();

  const activeMetric = TITLES[metric]!;
  const overviewQuery = useQuery(
    trpc.overview.stats.queryOptions({
      projectId,
      shareId,
      range,
      interval,
      filters,
      startDate,
      endDate,
    })
  );

  const series = overviewQuery.data?.series ?? [];
  const [mockRevenue, setMockRevenue] = useState(false);
  const data = useMemo(
    () => (mockRevenue ? injectMockRevenue(series) : series),
    [series, mockRevenue]
  );

  return (
    <div className="relative -top-0.5 col-span-6 mt-0 mb-0 md:m-0">
      <div className="card mb-2 grid grid-cols-2 overflow-hidden rounded-md md:grid-cols-4">
        {TITLES.map((title, index) => (
          <OverviewMetricCard
            active={metric === index}
            data={data.map((item) => ({
              date: item.date,
              current: item[title.key],
              previous: item[`prev_${title.key}`],
            }))}
            id={title.key}
            interval={interval}
            inverted={title.inverted}
            isLoading={overviewQuery.isLoading}
            key={title.key}
            label={title.title}
            metric={{
              current: overviewQuery.data?.metrics[title.key] ?? 0,
              previous: overviewQuery.data?.metrics[`prev_${title.key}`],
            }}
            onClick={() => setMetric(index)}
            range={range}
            unit={title.unit}
          />
        ))}

        <OverviewLiveHistogram projectId={projectId} shareId={shareId} />
      </div>

      <div className="card p-4">
        <div className="-mt-1 flex items-center justify-between">
          <div className="font-medium text-muted-foreground text-sm">
            {activeMetric.title}
          </div>
          {import.meta.env.DEV && (
            <button
              className={cn(
                'flex items-center gap-1 rounded-md border px-2 py-1 font-medium text-xs transition-colors',
                mockRevenue
                  ? 'border-chart-8 bg-chart-8/10 text-chart-8'
                  : 'border-border text-muted-foreground hover:bg-def-100'
              )}
              onClick={() => setMockRevenue((p) => !p)}
              title="Toggle mock revenue (dev only)"
              type="button"
            >
              <DollarSignIcon className="size-3" />
              {mockRevenue ? 'Mock revenue on' : 'Mock revenue'}
            </button>
          )}
        </div>
        <div className="h-[190px] w-full">
          {overviewQuery.isLoading && <Skeleton className="h-full w-full" />}
          {!overviewQuery.isLoading && data.length > 0 && (
            <Chart
              activeMetric={activeMetric}
              data={data}
              interval={interval}
              projectId={projectId}
            />
          )}
        </div>
      </div>
    </div>
  );
}

type SeriesItem = RouterOutputs['overview']['stats']['series'][number];

/**
 * Synthesize plausible-looking revenue (in cents) so we can preview the
 * normalized revenue bars without paying customers. Deterministic per row
 * via a tiny hash so toggling on/off doesn't reshuffle the bars.
 */
function injectMockRevenue(series: SeriesItem[]): SeriesItem[] {
  if (series.length === 0) {
    return series;
  }
  return series.map((item, i) => {
    const seed = hashStr(String(item.date)) + i;
    const wave = (Math.sin(seed * 0.7) + 1) / 2; // 0..1
    const jitter = ((seed * 9301 + 49_297) % 233_280) / 233_280; // 0..1
    const revenueCents = Math.round(50_000 + wave * 250_000 + jitter * 80_000);
    const prevCents = Math.round(revenueCents * (0.6 + jitter * 0.6));
    return {
      ...item,
      total_revenue: revenueCents,
      prev_total_revenue: prevCents,
    };
  });
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

type ChartPoint = SeriesItem & {
  /** Normalized revenue so bars share the primary metric's Y domain. */
  revenue_norm?: number;
};

function Chart({
  activeMetric,
  interval,
  data,
  projectId,
}: {
  activeMetric: (typeof TITLES)[number];
  interval: IInterval;
  data: SeriesItem[];
  projectId: string;
}) {
  const { range, startDate, endDate } = useOverviewOptions();
  const trpc = useTRPC();
  const isRevenueTab = activeMetric.key === 'total_revenue';

  const references = useQuery(
    trpc.reference.getChartReferences.queryOptions(
      {
        projectId,
        startDate,
        endDate,
        range,
      },
      { staleTime: 1000 * 60 * 10 }
    )
  );

  const [filters, setFilter] = useEventQueryFilters();
  const referrerSpikes = useQuery(
    trpc.overview.getReferrerSpikes.queryOptions(
      {
        projectId,
        startDate,
        endDate,
        range,
        interval,
        filters,
      },
      { staleTime: 1000 * 60 * 10 }
    )
  );
  // Click a spike's favicon → drop a referrer_name filter on the chart.
  // The query above already includes `filters`, so the chart re-fetches
  // with the new filter applied (which also re-computes spike detection
  // within that filtered slice).
  const handleSpikeClick = useCallback(
    (referrerName: string) => {
      setFilter('referrer_name', referrerName);
    },
    [setFilter]
  );
  // Flatten clusters → individual spikes for the tooltip's bucket-match
  // lookup. The chart marker layer keeps the cluster shape (one marker per
  // cluster); the tooltip works at spike granularity so any hovered bucket
  // can surface its spike, even one that's not the cluster's anchor.
  const flatSpikes = useMemo(
    () => referrerSpikes.data?.flatMap((c) => c.spikes) ?? null,
    [referrerSpikes.data]
  );

  const { chartData, showRevenue } = useMemo(() => {
    if (isRevenueTab) {
      return {
        chartData: data as ChartPoint[],
        showRevenue: false,
      };
    }

    let maxPrimary = 0;
    let maxRevenue = 0;
    for (const item of data) {
      const primary = (item[activeMetric.key] as number | undefined) ?? 0;
      const revenue = (item.total_revenue as number | undefined) ?? 0;
      if (primary > maxPrimary) {
        maxPrimary = primary;
      }
      if (revenue > maxRevenue) {
        maxRevenue = revenue;
      }
    }

    if (maxRevenue === 0 || maxPrimary === 0) {
      return {
        chartData: data as ChartPoint[],
        showRevenue: false,
      };
    }

    // Pin revenue peak at ~60% of the primary metric's peak so bars stay
    // legible without overshadowing the line/area.
    const scale = (maxPrimary * 0.4) / maxRevenue;
    return {
      chartData: data.map((item) => ({
        ...item,
        revenue_norm: ((item.total_revenue as number | undefined) ?? 0) * scale,
      })) as ChartPoint[],
      showRevenue: true,
    };
  }, [data, activeMetric.key, isRevenueTab]);

  const dashFromIndex = useDashedTail({ data, range, interval });
  const primaryColor = isRevenueTab ? REVENUE_COLOR : getChartColor(0);

  return (
    <ComposedChart
      animationDuration={0}
      aspectRatio="auto"
      className="h-full"
      data={chartData}
      margin={{ top: 0, right: 20, bottom: 40, left: 20 }}
      xDataKey="date"
    >
      <Grid horizontal />
      <YAxis numTicks={4} />
      <XAxis />

      <Area
        animate={false}
        dashArray="4,4"
        dashFromIndex={dashFromIndex}
        dataKey={activeMetric.key}
        fadeEdges="left"
        fill={primaryColor}
        fillOpacity={0.18}
        gradientToOpacity={0}
        key={activeMetric.key}
        stroke={primaryColor}
        strokeWidth={2}
      />

      <Line
        curve={curveMonotoneX}
        dataKey={`prev_${activeMetric.key}`}
        fadeEdges
        key={`prev-${activeMetric.key}`}
        stroke={PREV_LINE_COLOR}
        strokeWidth={2}
      />

      {showRevenue && (
        <Line
          curve={curveMonotoneX}
          dataKey="revenue_norm"
          fadeEdges
          stroke={REVENUE_COLOR}
          strokeWidth={1.5}
        />
      )}

      <OPDatePill interval={interval} />
      <OPSeriesDots
        dots={[
          { dataKey: activeMetric.key, color: primaryColor },
          { dataKey: `prev_${activeMetric.key}`, color: 'var(--foreground)' },
          ...(showRevenue
            ? [
                {
                  dataKey: 'revenue_norm',
                  color: REVENUE_COLOR,
                  label: '$',
                },
              ]
            : []),
        ]}
      />

      <OPChartTooltip<ChartPoint>
        indicatorColor={primaryColor}
        interval={interval}
        references={references.data}
        rows={(point) => {
          const primaryVal = point[activeMetric.key] as number | undefined;
          const primaryPrev = point[`prev_${activeMetric.key}`] as
            | number
            | undefined;

          const rows = [
            {
              color: primaryColor,
              label: activeMetric.title,
              value: primaryVal,
              previous: primaryPrev,
              inverted: activeMetric.inverted,
              unit: tooltipUnitFor(activeMetric.unit),
            },
          ];

          if (!isRevenueTab) {
            const revenue = (point.total_revenue as number | undefined) ?? 0;
            const prevRevenue =
              (point.prev_total_revenue as number | undefined) ?? 0;
            if (revenue > 0) {
              rows.push({
                color: REVENUE_COLOR,
                label: 'Revenue',
                value: revenue,
                previous: prevRevenue > 0 ? prevRevenue : undefined,
                inverted: false,
                unit: 'currency',
              });
            }
          }

          return rows;
        }}
        showDatePill={false}
        showDots={false}
        spikes={flatSpikes}
      />

      <OPReferences items={references.data} />
      <OPReferrerSpikes
        items={referrerSpikes.data}
        onSpikeClick={handleSpikeClick}
      />
    </ComposedChart>
  );
}

function tooltipUnitFor(unit: (typeof TITLES)[number]['unit']) {
  if (unit === 'currency') {
    return 'currency' as const;
  }
  if (unit === 'min') {
    return 'min' as const;
  }
  if (unit === '%') {
    return 'pct' as const;
  }
  return undefined;
}
