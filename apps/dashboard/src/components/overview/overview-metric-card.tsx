'use client';

import { fancyMinutes, useNumber } from '@/hooks/useNumerFormatter';
import type { IChartData, RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Area, AreaChart } from 'recharts';

import { average, getPreviousMetric, sum } from '@openpanel/common';
import type { IChartMetric, Metrics } from '@openpanel/validation';
import {
  PreviousDiffIndicator,
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
  }[];
  metric: {
    current: number;
    previous?: number | null;
  };
  unit?: string;
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
  const number = useNumber();
  const { current, previous } = metric;

  const renderValue = (value: number, unitClassName?: string, short = true) => {
    if (unit === 'min') {
      return <>{fancyMinutes(value)}</>;
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

  return (
    <Tooltiper
      content={
        <span>
          {label}:{' '}
          <span className="font-semibold">
            {renderValue(current, 'ml-1 font-light text-xl', false)}
          </span>
        </span>
      }
      asChild
      sideOffset={-20}
    >
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
              'pointer-events-none absolute -left-1 -right-1 bottom-0 top-0 z-0 opacity-50 transition-opacity duration-300 group-hover:opacity-100',
            )}
          >
            <AutoSizer>
              {({ width, height }) => (
                <AreaChart
                  width={width}
                  height={height / 4}
                  data={data}
                  style={{ marginTop: (height / 4) * 3 }}
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
          <span className="truncate text-sm font-medium text-muted-foreground">
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
          <div className="truncate font-mono text-3xl font-bold">{value}</div>
          {enhancer}
        </div>
      )}
    </div>
  );
}
