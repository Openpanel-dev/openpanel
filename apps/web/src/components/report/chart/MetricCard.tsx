'use client';

import type { IChartData } from '@/app/_trpc/client';
import { ColorSquare } from '@/components/ColorSquare';
import { useNumber } from '@/hooks/useNumerFormatter';
import { theme } from '@/utils/theme';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Area, AreaChart } from 'recharts';

import type { IChartMetric } from '@mixan/validation';

import { PreviousDiffIndicator } from '../PreviousDiffIndicator';

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
  const color = _color || theme?.colors['chart-0'];
  const number = useNumber();
  return (
    <div
      className="group relative border border-border p-4 rounded-md bg-white overflow-hidden h-24"
      key={serie.name}
    >
      <div className="absolute -top-1 -left-1 -right-1 -bottom-1 z-0 opacity-10 transition-opacity duration-300 group-hover:opacity-50">
        <AutoSizer>
          {({ width, height }) => (
            <AreaChart
              width={width}
              height={height / 3}
              data={serie.data}
              style={{ marginTop: (height / 3) * 2 }}
            >
              <defs>
                <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <Area
                dataKey="count"
                type="monotone"
                fill="url(#area)"
                fillOpacity={1}
                stroke={color}
                strokeWidth={2}
              />
            </AreaChart>
          )}
        </AutoSizer>
      </div>
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium">
            <ColorSquare>{serie.event.id}</ColorSquare>
            {serie.name ?? serie.event.displayName ?? serie.event.name}
          </div>
          <PreviousDiffIndicator {...serie.metrics.previous[metric]} />
        </div>
        <div className="flex justify-between items-end mt-2">
          <div className="text-2xl font-bold">
            {number.format(serie.metrics[metric])}
            {unit && <span className="ml-1 font-light text-xl">{unit}</span>}
          </div>
          {!!serie.metrics.previous[metric] && (
            <div>
              {number.format(serie.metrics.previous[metric]?.value)}
              {unit}
            </div>
          )}
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
