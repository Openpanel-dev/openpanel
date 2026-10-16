import type { IInterval } from '@openpanel/core/modules/report/report.constants';
import {
  OPLineChart,
  type OPLineChartSeries,
} from '@/components/charts/op-line-chart';
import { Skeleton } from '@/components/skeleton';
import { getChartColor } from '@/utils/theme';

const CHART_HEIGHT = 160;
// Room above and below the plotted positions so the line does not hug the edges.
const POSITION_PADDING = 2;
const DEFAULT_MAX_POSITION = 20;

const SERIES: OPLineChartSeries[] = [
  {
    dataKey: 'position',
    label: 'Avg Position',
    color: getChartColor(2),
    format: (value) => value.toFixed(1),
  },
];

interface GscPositionChartProps {
  data: Array<{ date: string; position: number }>;
  interval: IInterval;
  isLoading: boolean;
}

export function GscPositionChart({
  data,
  interval,
  isLoading,
}: GscPositionChartProps) {
  const positions = data.map((row) => row.position).filter((p) => p > 0);
  const minPosition = positions.length
    ? Math.max(1, Math.floor(Math.min(...positions)) - POSITION_PADDING)
    : 1;
  const maxPosition = positions.length
    ? Math.ceil(Math.max(...positions)) + POSITION_PADDING
    : DEFAULT_MAX_POSITION;

  return (
    <div className="card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium text-sm">Avg Position</h3>
        <span className="text-muted-foreground text-xs">Lower is better</span>
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <OPLineChart
          data={data}
          formatAxisValue={(value) => `#${value}`}
          height={CHART_HEIGHT}
          interval={interval}
          series={SERIES}
          yDomain={[minPosition, maxPosition]}
          yReversed
        />
      )}
    </div>
  );
}
