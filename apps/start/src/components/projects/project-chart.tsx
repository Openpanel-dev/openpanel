import { useState } from 'react';
import {
  Bar,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { useYAxisProps } from '../report-chart/common/axis';
import {
  ChartTooltipHeader,
  ChartTooltipItem,
  createChartTooltip,
} from '@/components/charts/chart-tooltip';
import { useNumber } from '@/hooks/use-numer-formatter';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

type ChartDataItem = {
  value: number;
  date: Date;
  revenue: number;
  timestamp: number;
};

const { Tooltip, TooltipProvider } = createChartTooltip<
  ChartDataItem,
  {
    color: 'blue' | 'green' | 'red';
  }
>(
  ({
    context,
    data: dataArray,
  }: {
    context: { color: 'blue' | 'green' | 'red' };
    data: ChartDataItem[];
  }) => {
    const { color } = context;
    const data = dataArray[0];
    const number = useNumber();

    if (!data) {
      return null;
    }

    const getColorValue = () => {
      if (color === 'green') {
        return '#16a34a';
      }
      if (color === 'red') {
        return '#dc2626';
      }
      return getChartColor(0);
    };

    const formatDate = (date: Date) => {
      return new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
      }).format(date);
    };

    return (
      <>
        <ChartTooltipHeader>
          <div className="text-muted-foreground">{formatDate(data.date)}</div>
        </ChartTooltipHeader>
        <ChartTooltipItem
          color={getColorValue()}
          innerClassName="row justify-between"
        >
          <div className="flex items-center gap-1">Sessions</div>
          <div className="font-bold font-mono">{number.format(data.value)}</div>
        </ChartTooltipItem>
        {data.revenue > 0 && (
          <ChartTooltipItem color="#3ba974">
            <div className="flex items-center gap-1">Revenue</div>
            <div className="font-medium font-mono">
              {number.currency(data.revenue / 100)}
            </div>
          </ChartTooltipItem>
        )}
      </>
    );
  }
);

export function ProjectChart({
  data,
  dots = false,
  color = 'blue',
}: {
  dots?: boolean;
  color?: 'blue' | 'green' | 'red';
  data: { value: number; date: Date; revenue: number }[];
}) {
  const [activeBar, setActiveBar] = useState(-1);

  const yAxisProps = useYAxisProps({
    width: 30,
  });
  if (data.length === 0) {
    return null;
  }

  // Transform data for Recharts (needs timestamp for time-based x-axis)
  const chartData = data.map((item) => ({
    ...item,
    timestamp: item.date.getTime(),
  }));

  const maxValue = Math.max(...data.map((d) => d.value), 0);
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 0);

  const getColorValue = () => {
    if (color === 'green') {
      return '#16a34a';
    }
    if (color === 'red') {
      return '#dc2626';
    }
    return getChartColor(0);
  };

  if (maxValue === 0) {
    return (
      <div className="relative h-full w-full pl-3">
        <div className="pointer-events-none absolute inset-x-3 bottom-2 h-12">
          <div className="flex h-full items-end gap-1.5 opacity-35">
            {[
              28, 42, 35, 50, 40, 56, 45, 60, 49, 32, 98, 29, 49, 69, 49, 20,
              28, 42, 35, 50, 40, 56, 45, 60, 49, 32, 98, 29, 49, 69, 49, 20,
            ].map((height, index) => (
              <div
                className="flex-1 rounded-full bg-foreground/20"
                key={index}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
          <p className="font-medium text-foreground/85 text-sm">
            No activity yet
          </p>
          <p className="text-muted-foreground text-xs">
            Sessions will show up here once tracking starts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full pl-3">
      <TooltipProvider color={color}>
        <ResponsiveContainer height="100%" width="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 10, bottom: 10, left: 0 }}
            onMouseMove={(e) => {
              setActiveBar(e.activeTooltipIndex ?? -1);
            }}
          >
            <XAxis
              dataKey="timestamp"
              domain={['dataMin', 'dataMax']}
              hide
              scale="time"
              type="number"
            />
            <YAxis
              {...yAxisProps}
              allowDecimals={false}
              domain={[0, maxValue || 'dataMax']}
            />
            <YAxis
              domain={[0, maxRevenue * 2 || 'dataMax']}
              hide
              orientation="right"
              width={0}
              yAxisId="right"
            />

            <Tooltip />

            <defs>
              <filter
                height="140%"
                id="rainbow-line-glow"
                width="140%"
                x="-20%"
                y="-20%"
              >
                <feGaussianBlur result="blur" stdDeviation="5" />
                <feComponentTransfer in="blur" result="dimmedBlur">
                  <feFuncA slope="0.5" type="linear" />
                </feComponentTransfer>
                <feComposite
                  in="SourceGraphic"
                  in2="dimmedBlur"
                  operator="over"
                />
              </filter>
            </defs>

            <Line
              activeDot={{
                stroke: getColorValue(),
                fill: 'var(--def-100)',
                strokeWidth: 2,
                r: 4,
              }}
              dataKey="value"
              dot={
                dots && data.length <= 90
                  ? {
                      stroke: getColorValue(),
                      fill: 'transparent',
                      strokeWidth: 1.5,
                      r: 3,
                    }
                  : false
              }
              filter="url(#rainbow-line-glow)"
              isAnimationActive={false}
              stroke={getColorValue()}
              strokeWidth={2}
              type="monotone"
            />

            <Bar
              dataKey="revenue"
              isAnimationActive={false}
              maxBarSize={20}
              radius={5}
              stackId="revenue"
              yAxisId="right"
            >
              {chartData.map((item, index) => (
                <Cell
                  className={cn(
                    index === activeBar
                      ? 'fill-emerald-700/100'
                      : 'fill-emerald-700/80'
                  )}
                  key={item.timestamp}
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </TooltipProvider>
    </div>
  );
}
