import {
  ChartTooltipHeader,
  ChartTooltipItem,
  createChartTooltip,
} from '@/components/charts/chart-tooltip';
import { useNumber } from '@/hooks/use-numer-formatter';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
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
      if (color === 'green') return '#16a34a';
      if (color === 'red') return '#dc2626';
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
          <div className="font-mono font-bold">{number.format(data.value)}</div>
        </ChartTooltipItem>
        {data.revenue > 0 && (
          <ChartTooltipItem color="#3ba974">
            <div className="flex items-center gap-1">Revenue</div>
            <div className="font-mono font-medium">
              {number.currency(data.revenue / 100)}
            </div>
          </ChartTooltipItem>
        )}
      </>
    );
  },
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
    if (color === 'green') return '#16a34a';
    if (color === 'red') return '#dc2626';
    return getChartColor(0);
  };

  return (
    <div className="relative h-full w-full">
      <TooltipProvider color={color}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
            onMouseMove={(e) => {
              setActiveBar(e.activeTooltipIndex ?? -1);
            }}
          >
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              hide
            />
            <YAxis domain={[0, maxValue || 'dataMax']} hide width={0} />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, maxRevenue * 2 || 'dataMax']}
              hide
              width={0}
            />

            <Tooltip />

            <defs>
              <filter
                id="rainbow-line-glow"
                x="-20%"
                y="-20%"
                width="140%"
                height="140%"
              >
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feComponentTransfer in="blur" result="dimmedBlur">
                  <feFuncA type="linear" slope="0.5" />
                </feComponentTransfer>
                <feComposite
                  in="SourceGraphic"
                  in2="dimmedBlur"
                  operator="over"
                />
              </filter>
            </defs>

            <Line
              type="monotone"
              dataKey="value"
              stroke={getColorValue()}
              strokeWidth={2}
              isAnimationActive={false}
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
              activeDot={{
                stroke: getColorValue(),
                fill: 'var(--def-100)',
                strokeWidth: 2,
                r: 4,
              }}
              filter="url(#rainbow-line-glow)"
            />

            <Bar
              dataKey="revenue"
              yAxisId="right"
              stackId="revenue"
              isAnimationActive={false}
              radius={5}
              maxBarSize={20}
            >
              {chartData.map((item, index) => (
                <Cell
                  key={item.timestamp}
                  className={cn(
                    index === activeBar
                      ? 'fill-emerald-700/100'
                      : 'fill-emerald-700/80',
                  )}
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </TooltipProvider>
    </div>
  );
}
