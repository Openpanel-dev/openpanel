import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import { curveMonotoneX } from '@visx/curve';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { RouterOutputs } from '@/trpc/client';
import type { IInterval } from '@openpanel/validation';
import type { timeWindows } from '@openpanel/constants';
import { Grid } from '../charts/grid';
import { Line } from '../charts/line';
import { LineChart } from '../charts/line-chart';
import { OPChartTooltip } from '../charts/op-tooltip';
import { OPDatePill } from '../charts/op-date-pill';
import { useDashedTail } from '../charts/op-dashed-tail';
import { XAxis } from '../charts/x-axis';
import { YAxis } from '../charts/y-axis';
import { SerieIcon } from '../report-chart/common/serie-icon';

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
  visibleSeries: SeriesMeta[],
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
    [data.items, visibleSeries],
  );

  const dashFromIndex = useDashedTail({ data: chartData, range, interval });

  if (visibleSeries.length === 0) {
    return (
      <div
        className={cn('flex items-center justify-center h-[358px]', className)}
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
          data={chartData}
          xDataKey="date"
          aspectRatio="auto"
          className="h-full"
          margin={{ top: 8, right: 12, bottom: 40, left: 32 }}
          animationDuration={0}
        >
          <Grid horizontal />
          <YAxis />
          <XAxis />
          {visibleSeries.map((series) => (
            <Line
              key={series.key}
              dataKey={`${series.key}:pageviews`}
              stroke={series.color}
              strokeWidth={1.5}
              curve={curveMonotoneX}
              animate={false}
              fadeEdges={false}
              dashFromIndex={dashFromIndex}
              dashArray="4,4"
            />
          ))}
          <OPDatePill interval={interval} />
          <OPChartTooltip<ChartPoint>
            interval={interval}
            showDots
            showCrosshair
            showDatePill={false}
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
            extra={(point) => {
              const total = visibleSeries.length;
              const hidden = Math.max(0, total - TOOLTIP_LIMIT);
              if (hidden === 0) return null;
              return (
                <div className="text-muted-foreground text-sm">
                  and {hidden} more {hidden === 1 ? 'item' : 'items'}
                </div>
              );
            }}
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
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    const hasOverflow = scrollWidth > clientWidth;

    setShowLeftGradient(hasOverflow && scrollLeft > 0);
    setShowRightGradient(
      hasOverflow && scrollLeft < scrollWidth - clientWidth - 1,
    );
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

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
          'pointer-events-none absolute left-0 top-0 z-10 h-full w-8 bg-gradient-to-r from-card to-transparent transition-opacity duration-200',
          showLeftGradient ? 'opacity-100' : 'opacity-0',
        )}
      />

      <div
        ref={scrollRef}
        className="flex gap-x-4 gap-y-1 overflow-x-auto px-2 py-1 hide-scrollbar text-xs"
      >
        {items.map((series) => (
          <div
            className="flex shrink-0 items-center gap-1"
            key={series.key}
            style={{ color: series.color }}
          >
            <SerieIcon name={series.prefix || series.name} />
            <span className="font-semibold whitespace-nowrap">
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
          'pointer-events-none absolute right-0 top-0 z-10 h-full w-8 bg-gradient-to-l from-card to-transparent transition-opacity duration-200',
          showRightGradient ? 'opacity-100' : 'opacity-0',
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
      className={cn('flex items-center justify-center h-[358px]', className)}
    >
      <div className="text-muted-foreground text-sm">Loading...</div>
    </div>
  );
}

export function OverviewLineChartEmpty({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn('flex items-center justify-center h-[358px]', className)}
    >
      <div className="text-muted-foreground text-sm">No data available</div>
    </div>
  );
}
