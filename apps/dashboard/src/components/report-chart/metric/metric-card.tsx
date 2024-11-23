'use client';

import { fancyMinutes, useNumber } from '@/hooks/useNumerFormatter';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Area, AreaChart } from 'recharts';

import type { IChartMetric } from '@openpanel/validation';

import {
  PreviousDiffIndicator,
  getDiffIndicator,
} from '../common/previous-diff-indicator';
import { SerieName } from '../common/serie-name';
import { useReportChartContext } from '../context';

interface MetricCardProps {
  serie: IChartData['series'][number];
  color?: string;
  metric: IChartMetric;
  unit?: string;
}

export function MetricCard({
  serie,
  color: _color,
  metric,
  unit,
}: MetricCardProps) {
  const {
    report: { previousIndicatorInverted },
    isEditMode,
  } = useReportChartContext();
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

  const previous = serie.metrics.previous?.[metric];

  const graphColors = getDiffIndicator(
    previousIndicatorInverted,
    previous?.state,
    '#6ee7b7', // green
    '#fda4af', // red
    '#93c5fd', // blue
  );

  return (
    <div
      className={cn('group relative p-4', isEditMode && 'card h-auto')}
      key={serie.id}
    >
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
              data={serie.data}
              style={{ marginTop: (height / 4) * 3 }}
            >
              <defs>
                <linearGradient
                  id={`colorUv${serie.id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={graphColors} stopOpacity={0.2} />
                  <stop
                    offset="100%"
                    stopColor={graphColors}
                    stopOpacity={0.05}
                  />
                </linearGradient>
              </defs>
              <Area
                dataKey="count"
                type="step"
                fill={`url(#colorUv${serie.id})`}
                fillOpacity={1}
                stroke={graphColors}
                strokeWidth={1}
                isAnimationActive={false}
              />
            </AreaChart>
          )}
        </AutoSizer>
      </div>
      <MetricCardNumber
        label={<SerieName name={serie.names} />}
        value={renderValue(serie.metrics[metric], 'ml-1 font-light text-xl')}
        enhancer={
          <PreviousDiffIndicator
            {...previous}
            className="text-sm text-muted-foreground"
          />
        }
      />
    </div>
  );
}

export function MetricCardNumber({
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
