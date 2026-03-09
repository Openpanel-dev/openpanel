import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartTooltipHeader,
  ChartTooltipItem,
  createChartTooltip,
} from '@/components/charts/chart-tooltip';
import {
  useYAxisProps,
  X_AXIS_STYLE_PROPS,
} from '@/components/report-chart/common/axis';
import { Skeleton } from '@/components/skeleton';
import { getChartColor } from '@/utils/theme';

interface ChartData {
  date: string;
  position: number;
}

const { TooltipProvider, Tooltip } = createChartTooltip<
  ChartData,
  Record<string, unknown>
>(({ data }) => {
  const item = data[0];
  if (!item) return null;
  return (
    <>
      <ChartTooltipHeader>
        <div>{item.date}</div>
      </ChartTooltipHeader>
      <ChartTooltipItem color={getChartColor(2)}>
        <div className="flex justify-between gap-8 font-medium font-mono">
          <span>Avg Position</span>
          <span>{item.position.toFixed(1)}</span>
        </div>
      </ChartTooltipItem>
    </>
  );
});

interface GscPositionChartProps {
  data: Array<{ date: string; position: number }>;
  isLoading: boolean;
}

export function GscPositionChart({ data, isLoading }: GscPositionChartProps) {
  const yAxisProps = useYAxisProps();

  const chartData: ChartData[] = data.map((r) => ({
    date: r.date,
    position: r.position,
  }));

  const positions = chartData.map((d) => d.position).filter((p) => p > 0);
  const minPos = positions.length ? Math.max(1, Math.floor(Math.min(...positions)) - 2) : 1;
  const maxPos = positions.length ? Math.ceil(Math.max(...positions)) + 2 : 20;

  return (
    <div className="card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium text-sm">Avg Position</h3>
        <span className="text-muted-foreground text-xs">Lower is better</span>
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <TooltipProvider>
          <ResponsiveContainer height={160} width="100%">
            <ComposedChart data={chartData}>
              <defs>
                <filter
                  height="140%"
                  id="gsc-pos-glow"
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
              <CartesianGrid
                className="stroke-border"
                horizontal
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                {...X_AXIS_STYLE_PROPS}
                dataKey="date"
                tickFormatter={(v: string) => v.slice(5)}
                type="category"
              />
              <YAxis
                {...yAxisProps}
                domain={[minPos, maxPos]}
                reversed
                tickFormatter={(v: number) => `#${v}`}
              />
              <Tooltip />
              <Line
                dataKey="position"
                dot={false}
                filter="url(#gsc-pos-glow)"
                isAnimationActive={false}
                stroke={getChartColor(2)}
                strokeWidth={2}
                type="monotone"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </TooltipProvider>
      )}
    </div>
  );
}
