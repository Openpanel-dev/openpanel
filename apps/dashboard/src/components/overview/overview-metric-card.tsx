'use client';

import { fancyMinutes, useNumber } from '@/hooks/useNumerFormatter';
import type { IChartData, RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Area, AreaChart } from 'recharts';

import { average, sum } from '@openpanel/common';
import type { IChartMetric } from '@openpanel/validation';

interface MetricCardProps {
  data: RouterOutputs['overview']['stats'];
  dataKey: keyof RouterOutputs['overview']['stats'][number];
  unit?: string;
  label: string;
  summary?: 'avg' | 'sum';
}

export function OverviewMetricCard({
  data,
  dataKey,
  unit,
  label,
  summary = 'avg',
}: MetricCardProps) {
  const number = useNumber();

  const renderValue = (value: number, unitClassName?: string) => {
    if (unit === 'min') {
      return <>{fancyMinutes(value)}</>;
    }

    return (
      <>
        {number.short(value)}
        {unit && <span className={unitClassName}>{unit}</span>}
      </>
    );
  };

  // const previous = serie.metrics.previous?.[metric];

  // const graphColors = getDiffIndicator(
  //   previousIndicatorInverted,
  //   previous?.state,
  //   '#6ee7b7', // green
  //   '#fda4af', // red
  //   '#93c5fd', // blue
  // );

  const graphColors = '#6ee7b7'; // green

  return (
    <button
      type="button"
      className={cn(
        'col-span-2 flex-1 shadow-[0_0_0_0.5px] shadow-border md:col-span-1',
        // index === metric && 'bg-def-100',
      )}
      onClick={() => {
        // setMetric(index);
      }}
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
                    id={`colorUv${dataKey}`}
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
                  dataKey={dataKey}
                  type="step"
                  fill={`url(#colorUv${dataKey})`}
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
          value={renderValue(
            summary === 'avg'
              ? average(data.map((item) => item[dataKey] as number))
              : sum(data.map((item) => item[dataKey] as number)),
            'ml-1 font-light text-xl',
          )}
          // enhancer={
          //   <PreviousDiffIndicator
          //     {...previous}
          //     className="text-sm text-muted-foreground"
          //   />
          // }
        />
      </div>
    </button>
  );
}

export function OverviewMetricCardNumber({
  label,
  value,
  enhancer,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  enhancer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-left">
          <span className="truncate text-muted-foreground">{label}</span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-4">
        <div className="truncate font-mono text-3xl font-bold">{value}</div>
        {enhancer}
      </div>
    </div>
  );
}
