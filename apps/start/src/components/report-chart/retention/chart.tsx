import { average, round } from '@openpanel/shared';
import { curveMonotoneX } from 'd3-shape';
import { useCallback, useMemo } from 'react';
import { useReportChartContext } from '../context';
import { Area, AreaChart } from '@/components/charts/area-chart';
import { Grid } from '@/components/charts/grid';
import { Line } from '@/components/charts/line';
import { OPChartTooltip } from '@/components/charts/op-tooltip';
import { XAxis } from '@/components/charts/x-axis';
import { YAxis } from '@/components/charts/y-axis';
import { useNumber } from '@/hooks/use-numer-formatter';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

// bklit's x axis is a time axis; periods since the cohort start are laid out
// as consecutive days from the epoch and read back by the axis formatter.
const PERIOD_MS = 86_400_000;
const AXIS_MARGIN = { top: 12, right: 12, bottom: 28, left: 40 };
const BARE_MARGIN = { top: 12, right: 12, bottom: 12, left: 12 };
const RETENTION_COLOR = getChartColor(0);
const AVERAGE_COLOR = getChartColor(1);

interface Props {
  data: RouterOutputs['chart']['cohort'];
}

interface RetentionPoint {
  [key: string]: unknown;
  date: Date;
  period: number;
  percentage: number;
  average: number;
  retained: number;
  total: number;
}

const periodOf = (date: Date) => Math.round(date.getTime() / PERIOD_MS);

export function Chart({ data }: Props) {
  const {
    report: { interval },
    isEditMode,
    options: { hideXAxis, hideYAxis },
  } = useReportChartContext();
  const number = useNumber();
  const averageRow = data[0];
  const averageRate = average(averageRow?.percentages ?? [], true) * 100;

  const points = useMemo(
    () =>
      (averageRow?.percentages ?? []).map(
        (rate, period): RetentionPoint => ({
          date: new Date(period * PERIOD_MS),
          period,
          percentage: rate * 100,
          average: averageRate,
          retained: averageRow?.values?.[period] ?? 0,
          total: averageRow?.sum ?? 0,
        })
      ),
    [averageRow, averageRate]
  );

  const formatPeriod = useCallback((date: Date) => String(periodOf(date)), []);

  return (
    <div
      className={cn('relative h-full w-full', isEditMode && 'card p-4')}
      data-report-chart="retention"
    >
      <AreaChart
        animationDuration={0}
        aspectRatio="auto"
        className="h-full"
        data={points}
        formatDateLabel={formatPeriod}
        margin={hideXAxis && hideYAxis ? BARE_MARGIN : AXIS_MARGIN}
        style={{ touchAction: 'pan-y' }}
        xDataKey="date"
      >
        <Grid horizontal />
        {!hideYAxis && <YAxis formatValue={(value) => `${value}%`} />}
        {!hideXAxis && <XAxis />}
        <Area
          animate={false}
          curve={curveMonotoneX}
          dataKey="percentage"
          fill={RETENTION_COLOR}
          stroke={RETENTION_COLOR}
        />
        <Line
          animate={false}
          dashArray="4,4"
          dashFromIndex={0}
          dataKey="average"
          showHighlight={false}
          stroke={AVERAGE_COLOR}
          strokeWidth={1.5}
        />
        <OPChartTooltip<RetentionPoint>
          rows={(point) => [
            {
              color: RETENTION_COLOR,
              label: 'Retention rate',
              value: point.percentage,
              format: (value) => number.formatWithUnit(value / 100, '%'),
              sub: [
                { label: 'Retained users', value: point.retained },
                { label: 'Total users', value: point.total },
              ],
            },
          ]}
          showCrosshair
          showDatePill={false}
          showDots
          title={(point) => (
            <span className="capitalize">
              {interval} {point.period}
            </span>
          )}
        />
      </AreaChart>
      <div
        className="pointer-events-none absolute top-2 right-3 font-medium text-xs"
        style={{ color: AVERAGE_COLOR }}
      >
        Average ({round(averageRate, 2)} %)
      </div>
    </div>
  );
}
