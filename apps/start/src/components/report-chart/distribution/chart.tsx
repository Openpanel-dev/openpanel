import { round } from '@openpanel/shared';
import { useCallback } from 'react';
import { useChartChrome } from '../common/chart-size';
import { SerieIcon } from '../common/serie-icon';
import { SerieName } from '../common/serie-name';
import { SeriesLegend } from '../common/time-series';
import { useReportChartContext } from '../context';
import { Bar } from '@/components/charts/bar';
import { BarChart } from '@/components/charts/bar-chart';
import { BarXAxis } from '@/components/charts/bar-x-axis';
import { Grid } from '@/components/charts/grid';
import {
  OPChartTooltip,
  type OPTooltipRow,
} from '@/components/charts/op-tooltip';
import { YAxis } from '@/components/charts/y-axis';
import { useNumber } from '@/hooks/use-numer-formatter';
import {
  type IRechartPayloadItem,
  useRechartDataModel,
} from '@/hooks/use-rechart-data-model';
import type { IVisibleSeries } from '@/hooks/use-visible-series';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

const BAR_GAP = 0.2;
const BAR_RADIUS = 4;

// `date` carries the bucket label ("1", "4-5", "120 - 240"), not a date.
type BucketPoint = Record<string, unknown> & { date: string };

interface Props {
  series: IVisibleSeries;
}

export function Chart({ series }: Props) {
  const { isEditMode } = useReportChartContext();
  const { showXAxis, showYAxis, margin } = useChartChrome();
  const number = useNumber();
  const chartData = useRechartDataModel(series) as BucketPoint[];

  const tooltipRows = useCallback(
    (point: BucketPoint): OPTooltipRow[] =>
      series.flatMap((serie) => {
        const payload = point[`${serie.id}:payload`] as
          | IRechartPayloadItem
          | undefined;
        if (!payload) {
          return [];
        }
        const total = serie.metrics.sum;
        return [
          {
            color: getChartColor(serie.index),
            icon: <SerieIcon name={serie.names} />,
            label: <SerieName name={serie.names} />,
            value: payload.count,
            format: (value: number) => `${number.format(value)} users`,
            percentage: total ? round((payload.count / total) * 100, 1) : null,
          },
        ];
      }),
    [series, number]
  );

  return (
    <div className={cn('col h-full w-full', isEditMode && 'card p-4')}>
      <div
        className="min-h-0 flex-1"
        data-report-chart="distribution"
        data-visible-series={series.length}
      >
        <BarChart
          animationDuration={0}
          aspectRatio="auto"
          barGap={BAR_GAP}
          className="h-full"
          data={chartData}
          margin={margin}
          xDataKey="date"
        >
          <Grid horizontal />
          {showYAxis && <YAxis formatValue={number.short} />}
          {/* At most ten buckets, and a skipped one reads as a gap. */}
          {showXAxis && <BarXAxis showAllLabels />}
          {series.map((serie) => (
            <Bar
              animate={false}
              dataKey={`${serie.id}:count`}
              fill={getChartColor(serie.index)}
              key={serie.id}
              lineCap={BAR_RADIUS}
            />
          ))}
          <OPChartTooltip<BucketPoint>
            datePill={false}
            rows={tooltipRows}
            showDots={false}
            title={(point) => point.date}
          />
        </BarChart>
      </div>
      <SeriesLegend series={series} />
    </div>
  );
}
