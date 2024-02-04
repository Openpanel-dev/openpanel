import type { IChartData } from '@/app/_trpc/client';
import { ColorSquare } from '@/components/ColorSquare';
import { useNumber } from '@/hooks/useNumerFormatter';
import type { IChartMetric } from '@/types';
import { theme } from '@/utils/theme';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Area, AreaChart } from 'recharts';

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
      className="group relative border border-border p-4 rounded-md bg-white overflow-hidden"
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
