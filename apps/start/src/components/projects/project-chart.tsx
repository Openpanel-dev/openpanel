import { curveMonotoneX } from 'd3-shape';
import { ComposedChart } from '@/components/charts/composed-chart';
import { Line } from '@/components/charts/line';
import { OPChartTooltip } from '@/components/charts/op-tooltip';
import { SeriesBar } from '@/components/charts/series-bar';
import { YAxis } from '@/components/charts/y-axis';
import { useNumber } from '@/hooks/use-numer-formatter';
import { getChartColor } from '@/utils/theme';

const MARGIN = { top: 10, right: 10, bottom: 10, left: 32 };
const SESSIONS_COLOR = getChartColor(0);
const REVENUE_COLOR = '#3ba974';
const REVENUE_AXIS_ID = 'right';
// Revenue bars sit in the lower half so the sessions line stays readable above them.
const REVENUE_HEADROOM = 2;
const REVENUE_MAX_BAR_SIZE = 20;
const REVENUE_BAR_RADIUS = 5;
const LINE_WIDTH = 2;
const AXIS_TICKS = 2;

const EMPTY_STATE_BARS = [
  28, 42, 35, 50, 40, 56, 45, 60, 49, 32, 98, 29, 49, 69, 49, 20, 28, 42, 35,
  50, 40, 56, 45, 60, 49, 32, 98, 29, 49, 69, 49, 20,
];

interface ChartPoint {
  [key: string]: unknown;
  value: number;
  date: Date;
  revenue: number;
}

export function ProjectChart({
  data,
}: {
  data: { value: number; date: Date; revenue: number }[];
}) {
  const number = useNumber();
  if (data.length === 0) {
    return null;
  }
  const points: ChartPoint[] = data.map((point) => ({ ...point }));

  const maxValue = Math.max(...data.map((point) => point.value), 0);
  const maxRevenue = Math.max(...data.map((point) => point.revenue), 0);
  const hasRevenue = maxRevenue > 0;

  if (maxValue === 0) {
    return <EmptyState />;
  }

  return (
    <div className="relative h-full w-full pl-3">
      <ComposedChart
        animationDuration={0}
        aspectRatio="auto"
        className="h-full"
        data={points}
        margin={MARGIN}
        maxBarSize={REVENUE_MAX_BAR_SIZE}
        xDataKey="date"
        yDomains={
          hasRevenue
            ? { [REVENUE_AXIS_ID]: [0, maxRevenue * REVENUE_HEADROOM] }
            : undefined
        }
      >
        <YAxis formatValue={number.short} numTicks={AXIS_TICKS} />
        {hasRevenue && (
          <SeriesBar
            animate={false}
            dataKey="revenue"
            fill={REVENUE_COLOR}
            radius={REVENUE_BAR_RADIUS}
            yAxisId={REVENUE_AXIS_ID}
          />
        )}
        <Line
          animate={false}
          curve={curveMonotoneX}
          dataKey="value"
          stroke={SESSIONS_COLOR}
          strokeWidth={LINE_WIDTH}
        />
        <OPChartTooltip<ChartPoint>
          rows={(point) => [
            {
              color: SESSIONS_COLOR,
              label: 'Sessions',
              value: point.value,
              format: number.format,
            },
            ...(point.revenue > 0
              ? [
                  {
                    color: REVENUE_COLOR,
                    label: 'Revenue',
                    value: point.revenue,
                    unit: 'currency',
                  },
                ]
              : []),
          ]}
          showCrosshair
          showDots
        />
      </ComposedChart>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="relative h-full w-full pl-3">
      <div className="pointer-events-none absolute inset-x-3 bottom-2 h-12">
        <div className="flex h-full items-end gap-1.5 opacity-35">
          {EMPTY_STATE_BARS.map((height, index) => (
            <div
              className="flex-1 rounded-full bg-foreground/20"
              key={`${index}-${height}`}
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
