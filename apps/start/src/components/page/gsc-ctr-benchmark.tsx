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

// Industry average CTR by position (Google organic)
const BENCHMARK: Record<number, number> = {
  1: 28.5,
  2: 15.7,
  3: 11.0,
  4: 8.0,
  5: 6.3,
  6: 5.0,
  7: 4.0,
  8: 3.3,
  9: 2.8,
  10: 2.5,
  11: 2.2,
  12: 2.0,
  13: 1.8,
  14: 1.5,
  15: 1.2,
  16: 1.1,
  17: 1.0,
  18: 0.9,
  19: 0.8,
  20: 0.7,
};

interface PageEntry {
  path: string;
  ctr: number;
  impressions: number;
}

interface ChartData {
  position: number;
  yourCtr: number | null;
  benchmark: number;
  pages: PageEntry[];
}

const { TooltipProvider, Tooltip } = createChartTooltip<
  ChartData,
  Record<string, unknown>
>(({ data }) => {
  const item = data[0];
  if (!item) {
    return null;
  }
  return (
    <>
      <ChartTooltipHeader>
        <div>Position #{item.position}</div>
      </ChartTooltipHeader>
      {item.yourCtr != null && (
        <ChartTooltipItem color={getChartColor(0)}>
          <div className="flex justify-between gap-8 font-medium font-mono">
            <span>Your avg CTR</span>
            <span>{item.yourCtr.toFixed(1)}%</span>
          </div>
        </ChartTooltipItem>
      )}
      <ChartTooltipItem color={getChartColor(3)}>
        <div className="flex justify-between gap-8 font-medium font-mono">
          <span>Benchmark</span>
          <span>{item.benchmark.toFixed(1)}%</span>
        </div>
      </ChartTooltipItem>
      {item.pages.length > 0 && (
        <div className="mt-1.5 border-t pt-1.5">
          {item.pages.map((p) => (
            <div
              className="flex items-center justify-between gap-4 py-0.5"
              key={p.path}
            >
              <span className="max-w-40 truncate font-mono text-muted-foreground text-xs">
                {p.path}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums">
                {(p.ctr * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
});

interface GscCtrBenchmarkProps {
  data: Array<{
    page: string;
    position: number;
    ctr: number;
    impressions: number;
  }>;
  isLoading: boolean;
}

export function GscCtrBenchmark({ data, isLoading }: GscCtrBenchmarkProps) {
  const yAxisProps = useYAxisProps();

  const grouped = new Map<number, { ctrSum: number; pages: PageEntry[] }>();
  for (const d of data) {
    const pos = Math.round(d.position);
    if (pos < 1 || pos > 20 || d.impressions < 10) {
      continue;
    }
    let path = d.page;
    try {
      path = new URL(d.page).pathname;
    } catch {
      // keep as-is
    }
    const entry = grouped.get(pos) ?? { ctrSum: 0, pages: [] };
    entry.ctrSum += d.ctr * 100;
    entry.pages.push({ path, ctr: d.ctr, impressions: d.impressions });
    grouped.set(pos, entry);
  }

  const chartData: ChartData[] = Array.from({ length: 20 }, (_, i) => {
    const pos = i + 1;
    const entry = grouped.get(pos);
    const pages = entry
      ? [...entry.pages].sort((a, b) => b.ctr - a.ctr).slice(0, 5)
      : [];
    return {
      position: pos,
      yourCtr: entry ? entry.ctrSum / entry.pages.length : null,
      benchmark: BENCHMARK[pos] ?? 0,
      pages,
    };
  });

  const hasAnyData = chartData.some((d) => d.yourCtr != null);

  return (
    <div className="card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium text-sm">CTR vs Position</h3>
        <div className="flex items-center gap-4 text-muted-foreground text-xs">
          {hasAnyData && (
            <span className="flex items-center gap-1.5">
              <span
                className="h-0.5 w-3 rounded-full"
                style={{ backgroundColor: getChartColor(0) }}
              />
              Your CTR
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span
              className="h-0.5 w-3 rounded-full opacity-60"
              style={{ backgroundColor: getChartColor(3) }}
            />
            Benchmark
          </span>
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <TooltipProvider>
          <ResponsiveContainer height={160} width="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid
                className="stroke-border"
                horizontal
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                {...X_AXIS_STYLE_PROPS}
                dataKey="position"
                domain={[1, 20]}
                tickFormatter={(v: number) => `#${v}`}
                ticks={[1, 5, 10, 15, 20]}
                type="number"
              />
              <YAxis
                {...yAxisProps}
                domain={[0, 'auto']}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip />
              <Line
                activeDot={{ r: 4 }}
                connectNulls={false}
                dataKey="yourCtr"
                dot={{ r: 3, fill: getChartColor(0) }}
                isAnimationActive={false}
                stroke={getChartColor(0)}
                strokeWidth={2}
                type="monotone"
              />
              <Line
                dataKey="benchmark"
                dot={false}
                isAnimationActive={false}
                stroke={getChartColor(3)}
                strokeDasharray="4 3"
                strokeOpacity={0.6}
                strokeWidth={1.5}
                type="monotone"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </TooltipProvider>
      )}
    </div>
  );
}
