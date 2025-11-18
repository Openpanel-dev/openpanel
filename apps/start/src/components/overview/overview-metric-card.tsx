import { fancyMinutes, useNumber } from '@/hooks/use-numer-formatter';
import { cn } from '@/utils/cn';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Area, AreaChart, Tooltip } from 'recharts';

import { formatDate, timeAgo } from '@/utils/date';
import { getChartColor } from '@/utils/theme';
import { getPreviousMetric } from '@openpanel/common';
import { useEffect, useRef, useState } from 'react';
import {
  ChartTooltipContainer,
  ChartTooltipHeader,
  ChartTooltipItem,
} from '../charts/chart-tooltip';
import {
  PreviousDiffIndicatorPure,
  getDiffIndicator,
} from '../report-chart/common/previous-diff-indicator';
import { Skeleton } from '../skeleton';
import { Tooltiper } from '../ui/tooltip';

interface MetricCardProps {
  id: string;
  data: {
    current: number;
    previous?: number;
    date: string;
  }[];
  metric: {
    current: number;
    previous?: number | null;
  };
  unit?: '' | 'date' | 'timeAgo' | 'min' | '%' | 'currency';
  label: string;
  onClick?: () => void;
  active?: boolean;
  inverted?: boolean;
  isLoading?: boolean;
}

export function OverviewMetricCard({
  id,
  data,
  metric,
  unit,
  label,
  onClick,
  active,
  inverted = false,
  isLoading = false,
}: MetricCardProps) {
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const number = useNumber();
  const { current, previous } = metric;
  const timer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      setCurrentIndex(null);
    }, 1000);
  }, [currentIndex]);

  const renderValue = (value: number, unitClassName?: string, short = true) => {
    if (unit === 'date') {
      return <>{formatDate(new Date(value))}</>;
    }

    if (unit === 'timeAgo') {
      return <>{timeAgo(new Date(value))}</>;
    }

    if (unit === 'min') {
      return <>{fancyMinutes(value)}</>;
    }

    if (unit === 'currency') {
      // Revenue is stored in cents, convert to dollars
      return <>{number.currency(value / 100)}</>;
    }

    return (
      <>
        {short ? number.short(value) : number.format(value)}
        {unit && <span className={unitClassName}>{unit}</span>}
      </>
    );
  };

  const graphColors = getDiffIndicator(
    inverted,
    getPreviousMetric(current, previous)?.state,
    '#6ee7b7', // green
    '#fda4af', // red
    '#93c5fd', // blue
  );

  const renderTooltip = () => {
    if (currentIndex) {
      return (
        <span>
          {formatDate(new Date(data[currentIndex]?.date))}:{' '}
          <span className="font-semibold">
            {renderValue(
              data[currentIndex].current,
              'ml-1 font-light text-xl',
              false,
            )}
          </span>
        </span>
      );
    }

    return (
      <span>
        {label}:{' '}
        <span className="font-semibold">
          {renderValue(metric.current, 'ml-1 font-light text-xl', false)}
        </span>
      </span>
    );
  };
  return (
    <Tooltiper content={renderTooltip()} asChild sideOffset={-20}>
      <button
        type="button"
        className={cn(
          'col-span-2 flex-1 shadow-[0_0_0_0.5px] shadow-border md:col-span-1',
          active && 'bg-def-100',
        )}
        onClick={onClick}
      >
        <div className={cn('group relative p-4')}>
          <div
            className={cn(
              'absolute -left-1 -right-1 bottom-0 top-0 z-0 opacity-50 transition-opacity duration-300 group-hover:opacity-100',
            )}
          >
            <AutoSizer>
              {({ width, height }) => (
                <AreaChart
                  width={width}
                  height={height / 4}
                  data={data}
                  style={{ marginTop: (height / 4) * 3 }}
                  onMouseMove={(event) => {
                    setCurrentIndex(event.activeTooltipIndex ?? null);
                  }}
                >
                  <defs>
                    <linearGradient
                      id={`colorUv${id}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={graphColors}
                        stopOpacity={0.2}
                      />
                      <stop
                        offset="100%"
                        stopColor={graphColors}
                        stopOpacity={0.05}
                      />
                    </linearGradient>
                  </defs>
                  <Tooltip content={() => null} />
                  <Area
                    dataKey={'current'}
                    type="step"
                    fill={`url(#colorUv${id})`}
                    fillOpacity={1}
                    stroke={graphColors}
                    strokeWidth={1}
                    isAnimationActive={false}
                  />
                </AreaChart>
              )}
            </AutoSizer>
          </div>
          <OverviewMetricCardNumber
            label={label}
            value={renderValue(current, 'ml-1 font-light text-xl')}
            enhancer={
              <PreviousDiffIndicatorPure
                className="text-sm"
                size="sm"
                inverted={inverted}
                {...getPreviousMetric(current, previous)}
              />
            }
            isLoading={isLoading}
          />
        </div>
      </button>
    </Tooltiper>
  );
}

export function OverviewMetricCardNumber({
  label,
  value,
  enhancer,
  className,
  isLoading,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  enhancer?: React.ReactNode;
  className?: string;
  isLoading?: boolean;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-left">
          <span className="truncate text-sm font-medium text-muted-foreground leading-[1.1]">
            {label}
          </span>
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-end justify-between gap-4">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-12" />
        </div>
      ) : (
        <div className="flex items-end justify-between gap-4">
          <div className="truncate font-mono text-3xl leading-[1.1] font-bold">
            {value}
          </div>
          {enhancer}
        </div>
      )}
    </div>
  );
}
