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
  PreviousDiffIndicator,
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
  const color = _color || theme?.colors['chart-0'];
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
      className="group relative border border-border p-2 rounded-md bg-white overflow-hidden h-24"
      key={serie.name}
    >
      <div className="absolute -top-2 -left-2 -right-2 -bottom-2 z-0 opacity-20 transition-opacity duration-300 group-hover:opacity-50 rounded-md">
        <AutoSizer>
          {({ width, height }) => (
            <AreaChart
              width={width}
              height={height / 3}
              data={serie.data}
              style={{ marginTop: (height / 3) * 2 }}
            >
              <defs>
                <linearGradient id="red" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={'red'} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={'red'} stopOpacity={0.2} />
                </linearGradient>
                <linearGradient id="green" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={'green'} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={'green'} stopOpacity={0.2} />
                </linearGradient>
                <linearGradient id="blue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={'blue'} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={'blue'} stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <Area
                dataKey="count"
                type="monotone"
                fill={`url(#${graphColors})`}
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
    <div className="border border-border p-4 rounded-md bg-white h-24">
      <div className="flex items-center justify-center h-full text-slate-600">
        No data
      </div>
    </div>
  );
}

export function MetricCardLoading() {
  return (
    <div className="h-24 p-4 py-5 flex flex-col bg-white border border-border rounded-md">
      <div className="bg-slate-200 rounded animate-pulse h-4 w-1/2"></div>
      <div className="bg-slate-200 rounded animate-pulse h-6 w-1/5 mt-auto"></div>
    </div>
  );
}
