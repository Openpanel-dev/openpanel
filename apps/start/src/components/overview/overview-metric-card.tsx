import { getPreviousMetric } from '@openpanel/common';
import { useEffect, useRef, useState } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Bar, BarChart, Tooltip } from 'recharts';
import {
  getDiffIndicator,
  PreviousDiffIndicatorPure,
} from '../report-chart/common/previous-diff-indicator';
import { Skeleton } from '../skeleton';
import { Tooltiper } from '../ui/tooltip';
import { fancyMinutes, useNumber } from '@/hooks/use-numer-formatter';
import { cn } from '@/utils/cn';
import { formatDate, timeAgo } from '@/utils/date';

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

    if (currentIndex) {
      timer.current = setTimeout(() => {
        setCurrentIndex(null);
      }, 1000);
    }

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [currentIndex]);

  const renderValue = (value: number, unitClassName?: string, short = true) => {
    if (unit === 'date') {
      return <>{formatDate(new Date(value))}</>;
    }

    if (unit === 'timeAgo') {
      if (!value) {
        return <>{'N/A'}</>;
      }
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
    '#93c5fd' // blue
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
              false
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
    <Tooltiper asChild content={renderTooltip()} sideOffset={-20}>
      <button
        className={cn(
          'col-span-2 flex-1 shadow-[0_0_0_0.5px] shadow-border md:col-span-1',
          active && 'bg-def-100'
        )}
        onClick={onClick}
        type="button"
      >
        <div className={cn('group relative p-4')}>
          <div
            className={cn(
              'absolute right-4 bottom-0 left-4 z-0 opacity-50 transition-opacity duration-300 group-hover:opacity-100'
            )}
          >
            <AutoSizer style={{ height: 20 }}>
              {({ width }) => (
                <BarChart
                  data={data}
                  height={20}
                  margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                  onMouseMove={(event) => {
                    setCurrentIndex(event.activeTooltipIndex ?? null);
                  }}
                  style={{
                    background: 'transparent',
                  }}
                  width={width}
                >
                  <Tooltip content={() => null} cursor={false} />
                  <Bar
                    dataKey={'current'}
                    fill={graphColors}
                    fillOpacity={1}
                    isAnimationActive={false}
                    strokeWidth={0}
                    type="step"
                  />
                </BarChart>
              )}
            </AutoSizer>
          </div>
          <OverviewMetricCardNumber
            enhancer={
              <PreviousDiffIndicatorPure
                className="text-sm"
                inverted={inverted}
                size="sm"
                {...getPreviousMetric(current, previous)}
              />
            }
            isLoading={isLoading}
            label={label}
            value={renderValue(current, 'ml-1 font-light text-xl')}
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
    <div className={cn('col min-w-0 gap-2', className)}>
      <div className="flex min-w-0 items-center gap-2 text-left">
        <span className="truncate font-medium text-muted-foreground text-sm leading-[1.1]">
          {label}
        </span>
      </div>
      {isLoading ? (
        <div className="flex items-end justify-between gap-4">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-12" />
        </div>
      ) : (
        <div className="w-full truncate text-left font-bold font-mono text-3xl leading-[1.1]">
          {value}
        </div>
      )}
      <div className="center col absolute top-0 right-0 bottom-0 justify-center pr-4">
        {enhancer}
      </div>
    </div>
  );
}
