import type { timeWindows } from '@openpanel/constants';
import type { IInterval } from '@openpanel/validation';
import { curveMonotoneX } from '@visx/curve';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Grid } from '../charts/grid';
import { Line } from '../charts/line';
import { LineChart } from '../charts/line-chart';
import { useDashedTail } from '../charts/op-dashed-tail';
import { OPDatePill } from '../charts/op-date-pill';
import { OPChartTooltip } from '../charts/op-tooltip';
import { XAxis } from '../charts/x-axis';
import { YAxis } from '../charts/y-axis';
import { SerieIcon } from '../report-chart/common/serie-icon';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

type SeriesData =
  RouterOutputs['overview']['topGenericSeries']['items'][number];

interface OverviewLineChartProps {
  data: RouterOutputs['overview']['topGenericSeries'];
  interval: IInterval;
  range?: keyof typeof timeWindows;
  searchQuery?: string;
  className?: string;
}

const VISIBLE_LIMIT = 5;
const TOOLTIP_LIMIT = 3;

interface SeriesMeta {
  key: string;
  name: string;
  prefix?: string;
  color: string;
}

interface ChartPoint {
  date: string;
  [key: string]: unknown;
}

function getSeriesKey(item: SeriesData): string {
  return item.prefix ? `${item.prefix}:${item.name}` : item.name;
}

function transformData(
  items: SeriesData[],
  visibleSeries: SeriesMeta[]
): ChartPoint[] {
  const allDates = new Set<string>();
  items.forEach((item) => {
    item.data.forEach((d) => allDates.add(d.date));
  });

  return Array.from(allDates)
    .sort()
    .map<ChartPoint>((date) => {
      const result: ChartPoint = { date };
      visibleSeries.forEach((series) => {
        const item = items.find((i) => getSeriesKey(i) === series.key);
        const dataPoint = item?.data.find((d) => d.date === date);
        // Always populate — bklit's Line/Area plots undefined values at SVG y=0
        // (chart top), so sparse series would visually shoot to the ceiling.
        result[`${series.key}:sessions`] = dataPoint?.sessions ?? 0;
        result[`${series.key}:pageviews`] = dataPoint?.pageviews ?? 0;
        if (dataPoint?.revenue !== undefined) {
          result[`${series.key}:revenue`] = dataPoint.revenue;
        }
      });
      return result;
    });
}

export function OverviewLineChart({
  data,
  interval,
  range,
  searchQuery,
  className,
}: OverviewLineChartProps) {
  const visibleSeries: SeriesMeta[] = useMemo(() => {
    const filtered = searchQuery
      ? data.items.filter((item) => {
          const q = searchQuery.toLowerCase();
          return (
            (item.name?.toLowerCase().includes(q) ?? false) ||
            (item.prefix?.toLowerCase().includes(q) ?? false)
          );
        })
      : data.items;
    return filtered.slice(0, VISIBLE_LIMIT).map((item, index) => ({
      key: getSeriesKey(item),
      name: item.name,
      prefix: item.prefix ?? undefined,
      color: getChartColor(index),
    }));
  }, [data.items, searchQuery]);

  const chartData = useMemo(
    () => transformData(data.items, visibleSeries),
    [data.items, visibleSeries]
  );

  const dashFromIndex = useDashedTail({ data: chartData, range, interval });

  if (visibleSeries.length === 0) {
    return (
      <div
        className={cn('flex h-[358px] items-center justify-center', className)}
      >
        <div className="text-muted-foreground text-sm">
          {searchQuery ? 'No results found' : 'No data available'}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('w-full p-4', className)}>
      <div className="h-[300px] w-full">
        <LineChart
          animationDuration={0}
          aspectRatio="auto"
          className="h-full"
          data={chartData}
          margin={{ top: 8, right: 12, bottom: 40, left: 32 }}
          xDataKey="date"
        >
          <Grid horizontal />
          <YAxis />
          <XAxis />
          {visibleSeries.map((series) => (
            <Line
              animate={false}
              curve={curveMonotoneX}
              dashArray="4,4"
              dashFromIndex={dashFromIndex}
              dataKey={`${series.key}:pageviews`}
              fadeEdges="left"
              key={series.key}
              stroke={series.color}
              strokeWidth={1.5}
            />
          ))}
          <OPDatePill interval={interval} />
          <OPChartTooltip<ChartPoint>
            extra={() => {
              const total = visibleSeries.length;
              const hidden = Math.max(0, total - TOOLTIP_LIMIT);
              if (hidden === 0) {
                return null;
              }
              return (
                <div className="text-muted-foreground text-sm">
                  and {hidden} more {hidden === 1 ? 'item' : 'items'}
                </div>
              );
            }}
            interval={interval}
            rows={(point) => {
              const ranked = visibleSeries
                .map((series) => {
                  const sessions =
                    (point[`${series.key}:sessions`] as number | undefined) ??
                    0;
                  const pageviews =
                    (point[`${series.key}:pageviews`] as number | undefined) ??
                    0;
                  const revenue = point[`${series.key}:revenue`] as
                    | number
                    | undefined;
                  return { series, sessions, pageviews, revenue };
                })
                .sort((a, b) => b.pageviews - a.pageviews);

              const top = ranked.slice(0, TOOLTIP_LIMIT);

              return top.map(({ series, sessions, pageviews, revenue }) => ({
                color: series.color,
                icon: <SerieIcon name={series.prefix || series.name} />,
                label: (
                  <>
                    {series.prefix && (
                      <>
                        <span className="text-muted-foreground">
                          {series.prefix}
                        </span>
                        <span className="mx-1">/</span>
                      </>
                    )}
                    {series.name || 'Not set'}
                  </>
                ),
                sub: [
                  ...(revenue !== undefined && revenue > 0
                    ? [
                        {
                          label: 'Revenue',
                          value: revenue,
                          unit: 'currency' as const,
                          color: 'var(--chart-8)',
                        },
                      ]
                    : []),
                  { label: 'Pageviews', value: pageviews },
                  { label: 'Sessions', value: sessions },
                ],
              }));
            }}
            showCrosshair
            showDatePill={false}
            showDots
          />
        </LineChart>
      </div>

      <LegendScrollable items={visibleSeries} />
    </div>
  );
}

function LegendScrollable({ items }: { items: SeriesMeta[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftGradient, setShowLeftGradient] = useState(false);
  const [showRightGradient, setShowRightGradient] = useState(false);

  const updateGradients = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    const { scrollLeft, scrollWidth, clientWidth } = el;
    const hasOverflow = scrollWidth > clientWidth;

    setShowLeftGradient(hasOverflow && scrollLeft > 0);
    setShowRightGradient(
      hasOverflow && scrollLeft < scrollWidth - clientWidth - 1
    );
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    updateGradients();

    el.addEventListener('scroll', updateGradients);
    window.addEventListener('resize', updateGradients);

    return () => {
      el.removeEventListener('scroll', updateGradients);
      window.removeEventListener('resize', updateGradients);
    };
  }, [updateGradients]);

  useEffect(() => {
    requestAnimationFrame(updateGradients);
  }, [items, updateGradients]);

  return (
    <div className="relative mt-4 -mb-2">
      <div
        className={cn(
          'pointer-events-none absolute top-0 left-0 z-10 h-full w-8 bg-gradient-to-r from-card to-transparent transition-opacity duration-200',
          showLeftGradient ? 'opacity-100' : 'opacity-0'
        )}
      />

      <div
        className="hide-scrollbar flex gap-x-4 gap-y-1 overflow-x-auto px-2 py-1 text-xs"
        ref={scrollRef}
      >
        {items.map((series) => (
          <div
            className="flex shrink-0 items-center gap-1"
            key={series.key}
            style={{ color: series.color }}
          >
            <SerieIcon name={series.prefix || series.name} />
            <span className="whitespace-nowrap font-semibold">
              {series.prefix && (
                <>
                  <span className="text-muted-foreground">{series.prefix}</span>
                  <span className="mx-1">/</span>
                </>
              )}
              {series.name || 'Not set'}
            </span>
          </div>
        ))}
      </div>

      <div
        className={cn(
          'pointer-events-none absolute top-0 right-0 z-10 h-full w-8 bg-gradient-to-l from-card to-transparent transition-opacity duration-200',
          showRightGradient ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  );
}

export function OverviewLineChartLoading({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn('flex h-[358px] items-center justify-center', className)}
    >
      <div className="text-muted-foreground text-sm">Loading...</div>
    </div>
  );
}

export function OverviewLineChartEmpty({ className }: { className?: string }) {
  return (
    <div
      className={cn('flex h-[358px] items-center justify-center', className)}
    >
      <div className="text-muted-foreground text-sm">No data available</div>
    </div>
  );
}
