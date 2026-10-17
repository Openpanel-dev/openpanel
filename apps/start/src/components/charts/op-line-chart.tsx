import type { IInterval } from '@openpanel/core/modules/report/report.constants';
import { curveMonotoneX } from 'd3-shape';
import { useCallback } from 'react';
import { Grid } from './grid';
import { Line, LineChart } from './line-chart';
import { OPChartTooltip, type OPTooltipRow } from './op-tooltip';
import { XAxis } from './x-axis';
import { YAxis } from './y-axis';
import { formatDateInterval } from '@/hooks/use-format-date-interval';
import { useNumber } from '@/hooks/use-numer-formatter';

const MARGIN = { top: 12, right: 12, bottom: 28, left: 40 };
const STROKE_WIDTH = 2;

export interface OPLineChartSeries {
  dataKey: string;
  label: string;
  color: string;
  /** Series on their own scale stay readable next to a much larger one. */
  yAxisId?: string;
  /** Tooltip value format. Default: the full locale number. */
  format?: (value: number) => string;
}

export type OPLineChartPoint = Record<string, unknown> & { date: string };

interface OPLineChartProps<T extends OPLineChartPoint> {
  data: T[];
  series: OPLineChartSeries[];
  interval: IInterval;
  height: number;
  /** Fixed y domain for the primary axis. */
  yDomain?: [number, number];
  /** Smallest value at the top, for "lower is better" metrics. */
  yReversed?: boolean;
  formatAxisValue?: (value: number) => string;
}

/** A small card line chart: a few date series, a left axis and the shared tooltip. */
export function OPLineChart<T extends OPLineChartPoint>({
  data,
  series,
  interval,
  height,
  yDomain,
  yReversed,
  formatAxisValue,
}: OPLineChartProps<T>) {
  const number = useNumber();
  const formatDateLabel = useCallback(
    (date: Date) => formatDateInterval({ interval, date, short: true }),
    [interval]
  );
  const rows = useCallback(
    (point: T): OPTooltipRow[] =>
      series.map((serie) => {
        const value = point[serie.dataKey];
        return {
          color: serie.color,
          label: serie.label,
          value: typeof value === 'number' ? value : null,
          format: serie.format ?? number.format,
        };
      }),
    [series, number.format]
  );

  return (
    <LineChart
      animationDuration={0}
      aspectRatio="auto"
      data={data}
      formatDateLabel={formatDateLabel}
      margin={MARGIN}
      style={{ height }}
      xDataKey="date"
      yDomain={yDomain}
      yReversed={yReversed}
    >
      <Grid horizontal />
      <YAxis formatValue={formatAxisValue ?? number.short} />
      <XAxis />
      {series.map((serie) => (
        <Line
          animate={false}
          curve={curveMonotoneX}
          dataKey={serie.dataKey}
          key={serie.dataKey}
          stroke={serie.color}
          strokeWidth={STROKE_WIDTH}
          yAxisId={serie.yAxisId}
        />
      ))}
      <OPChartTooltip<T>
        interval={interval}
        rows={rows}
        showCrosshair
        showDots
      />
    </LineChart>
  );
}

/** Inline legend for a card header, one swatch per series. */
export function OPLineChartLegend({ series }: { series: OPLineChartSeries[] }) {
  return (
    <div className="flex items-center gap-4 text-muted-foreground text-xs">
      {series.map((serie) => (
        <span className="flex items-center gap-1.5" key={serie.dataKey}>
          <span
            className="h-0.5 w-3 rounded-full"
            style={{ backgroundColor: serie.color }}
          />
          {serie.label}
        </span>
      ))}
    </div>
  );
}
