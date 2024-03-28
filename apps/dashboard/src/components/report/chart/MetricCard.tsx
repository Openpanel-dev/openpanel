'use client';

import { ColorSquare } from '@/components/color-square';
import { fancyMinutes, useNumber } from '@/hooks/useNumerFormatter';
import type { IChartData } from '@/trpc/client';
import { theme } from '@/utils/theme';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Area, AreaChart } from 'recharts';

import type { IChartMetric } from '@openpanel/validation';

import {
  getDiffIndicator,
  PreviousDiffIndicatorText,
} from '../PreviousDiffIndicator';
import { useChartContext } from './ChartProvider';

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
  const { previousIndicatorInverted } = useChartContext();
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

  const previous = serie.metrics.previous[metric];

  const graphColors = getDiffIndicator(
    previousIndicatorInverted,
    previous?.state,
    'green',
    'red',
    'blue'
  );

  return (
    <div
      className="card group relative h-24 overflow-hidden p-4"
      key={serie.name}
    >
      <div className="absolute inset-0 -left-1 -right-1 z-0 rounded-md opacity-20 transition-opacity duration-300 group-hover:opacity-50">
        <AutoSizer>
          {({ width, height }) => (
            <AreaChart
              width={width}
              height={height / 4}
              data={serie.data}
              style={{ marginTop: (height / 4) * 3 }}
            >
              <Area
                dataKey="count"
                type="monotone"
                fill={`transparent`}
                fillOpacity={1}
                stroke={graphColors}
                strokeWidth={2}
              />
            </AreaChart>
          )}
        </AutoSizer>
      </div>
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-left font-medium">
            <ColorSquare>{serie.event.id}</ColorSquare>
            <span
              role="heading"
              className="overflow-hidden text-ellipsis whitespace-nowrap"
            >
              {serie.name || serie.event.displayName || serie.event.name}
            </span>
          </div>
          {/* <PreviousDiffIndicator {...serie.metrics.previous[metric]} /> */}
        </div>
        <div className="mt-2 flex items-end justify-between">
          <div className="overflow-hidden text-ellipsis whitespace-nowrap text-2xl font-bold">
            {renderValue(serie.metrics[metric], 'ml-1 font-light text-xl')}
          </div>
          <PreviousDiffIndicatorText
            {...serie.metrics.previous[metric]}
            className="mb-0.5 text-xs font-medium"
          />
        </div>
      </div>
    </div>
  );
}

export function MetricCardEmpty() {
  return (
    <div className="card h-24 p-4">
      <div className="flex h-full items-center justify-center text-slate-600">
        No data
      </div>
    </div>
  );
}

export function MetricCardLoading() {
  return (
    <div className="card flex h-24 flex-col p-4 py-5">
      <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200"></div>
      <div className="mt-auto h-6 w-1/5 animate-pulse rounded bg-slate-200"></div>
    </div>
  );
}
