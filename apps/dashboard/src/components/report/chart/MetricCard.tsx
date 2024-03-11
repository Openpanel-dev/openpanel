'use client';

import type { IChartData } from '@/app/_trpc/client';
import { ColorSquare } from '@/components/ColorSquare';
import { fancyMinutes, useNumber } from '@/hooks/useNumerFormatter';
import { theme } from '@/utils/theme';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Area, AreaChart } from 'recharts';

import type { IChartMetric } from '@mixan/validation';

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
      className="group relative card p-4 overflow-hidden h-24"
      key={serie.name}
    >
      <div className="absolute inset-0 -left-1 -right-1 z-0 opacity-20 transition-opacity duration-300 group-hover:opacity-50 rounded-md">
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
          <div className="flex items-center gap-2 font-medium text-left min-w-0">
            <ColorSquare>{serie.event.id}</ColorSquare>
            <span className="text-ellipsis overflow-hidden whitespace-nowrap">
              {serie.name || serie.event.displayName || serie.event.name}
            </span>
          </div>
          {/* <PreviousDiffIndicator {...serie.metrics.previous[metric]} /> */}
        </div>
        <div className="flex justify-between items-end mt-2">
          <div className="text-2xl font-bold text-ellipsis overflow-hidden whitespace-nowrap">
            {renderValue(serie.metrics[metric], 'ml-1 font-light text-xl')}
          </div>
          <PreviousDiffIndicatorText
            {...serie.metrics.previous[metric]}
            className="font-medium text-xs mb-0.5"
          />
        </div>
      </div>
    </div>
  );
}

export function MetricCardEmpty() {
  return (
    <div className="card p-4 h-24">
      <div className="flex items-center justify-center h-full text-slate-600">
        No data
      </div>
    </div>
  );
}

export function MetricCardLoading() {
  return (
    <div className="h-24 p-4 py-5 flex flex-col card">
      <div className="bg-slate-200 rounded animate-pulse h-4 w-1/2"></div>
      <div className="bg-slate-200 rounded animate-pulse h-6 w-1/5 mt-auto"></div>
    </div>
  );
}
