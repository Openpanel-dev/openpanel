import { Bar } from '@/components/charts/bar';
import { BarChart } from '@/components/charts/bar-chart';
import { BarXAxis } from '@/components/charts/bar-x-axis';
import { Grid } from '@/components/charts/grid';
import {
  OPLineChartLegend,
  type OPLineChartSeries,
} from '@/components/charts/op-line-chart';
import {
  OPChartTooltip,
  type OPTooltipRow,
} from '@/components/charts/op-tooltip';
import { YAxis } from '@/components/charts/y-axis';
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

const POSITION_COUNT = 20;
// Pages with fewer impressions than this have too noisy a CTR to average.
const MIN_IMPRESSIONS = 10;
const PAGES_PER_POSITION = 5;
const MARGIN = { top: 12, right: 12, bottom: 28, left: 40 };
const BAR_GAP = 0.3;
const BAR_RADIUS = 2;
const AXIS_LABEL_COUNT = 5;

const YOUR_CTR_SERIES: OPLineChartSeries = {
  dataKey: 'yourCtr',
  label: 'Your CTR',
  color: getChartColor(0),
};
const BENCHMARK_SERIES: OPLineChartSeries = {
  dataKey: 'benchmark',
  label: 'Benchmark',
  color: `color-mix(in oklch, ${getChartColor(3)} 60%, transparent)`,
};

interface PageEntry {
  path: string;
  ctr: number;
  impressions: number;
}

interface ChartRow {
  [key: string]: unknown;
  position: number;
  label: string;
  yourCtr: number | null;
  benchmark: number;
  pages: PageEntry[];
}

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

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
  const grouped = new Map<number, { ctrSum: number; pages: PageEntry[] }>();
  for (const row of data) {
    const position = Math.round(row.position);
    const outOfRange = position < 1 || position > POSITION_COUNT;
    if (outOfRange || row.impressions < MIN_IMPRESSIONS) {
      continue;
    }
    let path = row.page;
    try {
      path = new URL(row.page).pathname;
    } catch {
      // keep as-is
    }
    const entry = grouped.get(position) ?? { ctrSum: 0, pages: [] };
    entry.ctrSum += row.ctr * 100;
    entry.pages.push({ path, ctr: row.ctr, impressions: row.impressions });
    grouped.set(position, entry);
  }

  const rows: ChartRow[] = Array.from({ length: POSITION_COUNT }, (_, i) => {
    const position = i + 1;
    const entry = grouped.get(position);
    const pages = entry
      ? [...entry.pages]
          .sort((a, b) => b.ctr - a.ctr)
          .slice(0, PAGES_PER_POSITION)
      : [];
    return {
      position,
      label: `#${position}`,
      yourCtr: entry ? entry.ctrSum / entry.pages.length : null,
      benchmark: BENCHMARK[position] ?? 0,
      pages,
    };
  });

  const hasAnyData = rows.some((row) => row.yourCtr != null);
  const legend = hasAnyData
    ? [YOUR_CTR_SERIES, BENCHMARK_SERIES]
    : [BENCHMARK_SERIES];

  return (
    <div className="card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium text-sm">CTR vs Position</h3>
        <OPLineChartLegend series={legend} />
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <BarChart
          animationDuration={0}
          aspectRatio="auto"
          barGap={BAR_GAP}
          className="h-40"
          data={rows}
          margin={MARGIN}
          xDataKey="label"
        >
          <Grid horizontal />
          <YAxis formatValue={(value) => `${value}%`} />
          <BarXAxis maxLabels={AXIS_LABEL_COUNT} />
          <Bar
            animate={false}
            dataKey={YOUR_CTR_SERIES.dataKey}
            fill={YOUR_CTR_SERIES.color}
            lineCap={BAR_RADIUS}
          />
          <Bar
            animate={false}
            dataKey={BENCHMARK_SERIES.dataKey}
            fill={BENCHMARK_SERIES.color}
            lineCap={BAR_RADIUS}
          />
          <OPChartTooltip<ChartRow>
            datePill={false}
            extra={renderPages}
            rows={tooltipRows}
            showDots={false}
            title={(row) => `Position ${row.label}`}
          />
        </BarChart>
      )}
    </div>
  );
}

function tooltipRows(row: ChartRow): OPTooltipRow[] {
  const rows: OPTooltipRow[] = [];
  if (row.yourCtr != null) {
    rows.push({
      color: YOUR_CTR_SERIES.color,
      label: YOUR_CTR_SERIES.label,
      value: row.yourCtr,
      format: formatPercent,
    });
  }
  rows.push({
    color: getChartColor(3),
    label: BENCHMARK_SERIES.label,
    value: row.benchmark,
    format: formatPercent,
  });
  return rows;
}

function renderPages(row: ChartRow) {
  if (row.pages.length === 0) {
    return null;
  }
  return (
    <div className="mt-1 border-t pt-1.5">
      {row.pages.map((page) => (
        <div
          className="flex items-center justify-between gap-4 py-0.5"
          key={page.path}
        >
          <span className="max-w-40 truncate font-mono text-muted-foreground text-xs">
            {page.path}
          </span>
          <span className="shrink-0 font-mono text-xs tabular-nums">
            {formatPercent(page.ctr * 100)}
          </span>
        </div>
      ))}
    </div>
  );
}
