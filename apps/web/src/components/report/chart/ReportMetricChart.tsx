import type { IChartData } from '@/app/_trpc/client';
import { ColorSquare } from '@/components/ColorSquare';
import { useNumber } from '@/hooks/useNumerFormatter';
import { useVisibleSeries } from '@/hooks/useVisibleSeries';
import { cn } from '@/utils/cn';
import { theme } from '@/utils/theme';
import { ChevronDown, ChevronUp, ChevronUpCircle } from 'lucide-react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Area, AreaChart } from 'recharts';

import { PreviousDiffIndicator } from '../PreviousDiffIndicator';
import { useChartContext } from './ChartProvider';

interface ReportMetricChartProps {
  data: IChartData;
}

export function ReportMetricChart({ data }: ReportMetricChartProps) {
  const { editMode } = useChartContext();
  const { series } = useVisibleSeries(data, editMode ? undefined : 2);
  const color = theme?.colors['chart-0'];
  const number = useNumber();
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4',
        editMode && 'md:grid-cols-2 lg:grid-cols-3'
      )}
    >
      {series.map((serie) => {
        return (
          <div
            className="relative border border-border p-4 rounded-md bg-white overflow-hidden"
            key={serie.name}
          >
            <div className="absolute -top-1 -left-1 -right-1 -bottom-1 z-0 opacity-20">
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
                        <stop
                          offset="95%"
                          stopColor={color}
                          stopOpacity={0.1}
                        />
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
              <div className="flex items-center gap-2 text-lg font-medium">
                <ColorSquare>{serie.event.id}</ColorSquare>
                {serie.name ?? serie.event.displayName ?? serie.event.name}
              </div>
              <div className="flex justify-between items-end">
                <div className="mt-6 font-mono text-3xl font-bold">
                  {number.format(serie.metrics.sum)}
                </div>
                {!!serie.metrics.previous.sum && (
                  <div className="flex flex-col items-end">
                    <PreviousDiffIndicator {...serie.metrics.previous.sum}>
                      <div className="font-mono">
                        {number.format(serie.metrics.previous.sum.value)}
                      </div>
                    </PreviousDiffIndicator>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
