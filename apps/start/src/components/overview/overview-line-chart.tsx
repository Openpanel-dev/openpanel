import { useNumber } from '@/hooks/use-numer-formatter';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { RouterOutputs } from '@/trpc/client';
import type { IInterval } from '@openpanel/validation';
import { useXAxisProps, useYAxisProps } from '../report-chart/common/axis';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { OverviewLineChartTooltip } from './overview-line-chart-tooltip';

type SeriesData =
  RouterOutputs['overview']['topGenericSeries']['items'][number];

interface OverviewLineChartProps {
  data: RouterOutputs['overview']['topGenericSeries'];
  interval: IInterval;
  searchQuery?: string;
  className?: string;
}

function transformDataForRecharts(
  items: SeriesData[],
  searchQuery?: string,
): Array<{
  date: string;
  timestamp: number;
  [key: `${string}:sessions`]: number;
  [key: `${string}:pageviews`]: number;
  [key: `${string}:revenue`]: number | undefined;
  [key: `${string}:payload`]: {
    name: string;
    prefix?: string;
    color: string;
  };
}> {
  // Filter items by search query
  const filteredItems = searchQuery
    ? items.filter((item) => {
        const queryLower = searchQuery.toLowerCase();
        return (
          (item.name?.toLowerCase().includes(queryLower) ?? false) ||
          (item.prefix?.toLowerCase().includes(queryLower) ?? false)
        );
      })
    : items;

  // Limit to top 15
  const topItems = filteredItems.slice(0, 15);

  // Get all unique dates from all items
  const allDates = new Set<string>();
  topItems.forEach((item) => {
    item.data.forEach((d) => allDates.add(d.date));
  });

  const sortedDates = Array.from(allDates).sort();

  // Transform to recharts format
  return sortedDates.map((date) => {
    const timestamp = new Date(date).getTime();
    const result: Record<string, any> = {
      date,
      timestamp,
    };

    topItems.forEach((item, index) => {
      const dataPoint = item.data.find((d) => d.date === date);
      if (dataPoint) {
        // Use prefix:name as key to avoid collisions when same name exists with different prefixes
        const key = item.prefix ? `${item.prefix}:${item.name}` : item.name;
        result[`${key}:sessions`] = dataPoint.sessions;
        result[`${key}:pageviews`] = dataPoint.pageviews;
        if (dataPoint.revenue !== undefined) {
          result[`${key}:revenue`] = dataPoint.revenue;
        }
        result[`${key}:payload`] = {
          name: item.name,
          prefix: item.prefix,
          color: getChartColor(index),
        };
      }
    });

    return result as typeof result & {
      date: string;
      timestamp: number;
    };
  });
}

export function OverviewLineChart({
  data,
  interval,
  searchQuery,
  className,
}: OverviewLineChartProps) {
  const number = useNumber();

  const chartData = useMemo(
    () => transformDataForRecharts(data.items, searchQuery),
    [data.items, searchQuery],
  );

  const visibleItems = useMemo(() => {
    const filtered = searchQuery
      ? data.items.filter((item) => {
          const queryLower = searchQuery.toLowerCase();
          return (
            (item.name?.toLowerCase().includes(queryLower) ?? false) ||
            (item.prefix?.toLowerCase().includes(queryLower) ?? false)
          );
        })
      : data.items;
    return filtered.slice(0, 15);
  }, [data.items, searchQuery]);

  const xAxisProps = useXAxisProps({ interval, hide: false });
  const yAxisProps = useYAxisProps({});

  if (visibleItems.length === 0) {
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
      <div className="h-[358px] w-full">
        <OverviewLineChartTooltip.TooltipProvider interval={interval}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={true}
                vertical={false}
                className="stroke-border"
              />
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <Tooltip content={<OverviewLineChartTooltip.Tooltip />} />
              {visibleItems.map((item, index) => {
                const color = getChartColor(index);
                // Use prefix:name as key to avoid collisions when same name exists with different prefixes
                const key = item.prefix
                  ? `${item.prefix}:${item.name}`
                  : item.name;
                return (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={`${key}:sessions`}
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </OverviewLineChartTooltip.TooltipProvider>
      </div>

      {/* Legend */}
      <LegendScrollable items={visibleItems} />
    </div>
  );
}

function LegendScrollable({
  items,
}: {
  items: SeriesData[];
}) {
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

  // Update gradients when items change
  useEffect(() => {
    requestAnimationFrame(updateGradients);
  }, [items, updateGradients]);

  return (
    <div className="relative mt-4 -mb-2">
      {/* Left gradient */}
      <div
        className={cn(
          'pointer-events-none absolute left-0 top-0 z-10 h-full w-8 bg-gradient-to-r from-card to-transparent transition-opacity duration-200',
          showLeftGradient ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* Scrollable legend */}
      <div
        ref={scrollRef}
        className="flex gap-x-4 gap-y-1 overflow-x-auto px-2 py-1 hide-scrollbar text-xs"
      >
        {items.map((item, index) => {
          const color = getChartColor(index);
          return (
            <div
              className="flex shrink-0 items-center gap-1"
              key={item.prefix ? `${item.prefix}:${item.name}` : item.name}
              style={{ color }}
            >
              <SerieIcon name={item.prefix || item.name} />
              <span className="font-semibold whitespace-nowrap">
                {item.prefix && (
                  <>
                    <span className="text-muted-foreground">{item.prefix}</span>
                    <span className="mx-1">/</span>
                  </>
                )}
                {item.name || 'Not set'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Right gradient */}
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
