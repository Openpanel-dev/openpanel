import { PointClick } from '../common/point-click';
import {
  previousPeriodColor,
  TimeSeriesFrame,
  type TimeSeriesPoint,
  useTimeSeriesChart,
} from '../common/time-series';
import { useReportChartContext } from '../context';
import { ComposedChart } from '@/components/charts/composed-chart';
import { Grid } from '@/components/charts/grid';
import { OPDatePill } from '@/components/charts/op-date-pill';
import { OPReferences } from '@/components/charts/op-references';
import { OPChartTooltip } from '@/components/charts/op-tooltip';
import { SeriesBar } from '@/components/charts/series-bar';
import { XAxis } from '@/components/charts/x-axis';
import { YAxis } from '@/components/charts/y-axis';
import type { IVisibleSeries } from '@/hooks/use-visible-series';
import type { IChartData } from '@/trpc/client';
import { getChartColor } from '@/utils/theme';

const BAR_RADIUS = 4;
const MAX_BAR_WIDTH = 48;

interface Props {
  data: IChartData;
  series: IVisibleSeries;
}

export function Chart({ data, series }: Props) {
  const {
    report: { options },
  } = useReportChartContext();
  const chart = useTimeSeriesChart({ data, series, chartType: 'histogram' });
  const isStacked = options?.type === 'histogram' && options.stacked === true;
  // Stacking applies to every bar series, so stacked histograms show the
  // previous period in the tooltip only.
  const showPreviousBars = chart.previous && !isStacked;

  return (
    <TimeSeriesFrame chartType="histogram" menu={chart.menu} series={series}>
      <ComposedChart
        animationDuration={0}
        aspectRatio="auto"
        className="h-full"
        data={chart.chartData}
        formatDateLabel={chart.formatDateLabel}
        margin={chart.margin}
        maxBarSize={MAX_BAR_WIDTH}
        stacked={isStacked}
        xDataKey="date"
      >
        <Grid horizontal />
        {!chart.hideYAxis && <YAxis formatValue={chart.formatAxisValue} />}
        {!chart.hideXAxis && <XAxis />}
        {showPreviousBars &&
          series.map((serie) => (
            <SeriesBar
              animate={false}
              dataKey={`${serie.id}:prev:count`}
              fill={previousPeriodColor(serie.index)}
              key={`${serie.id}:prev`}
              radius={BAR_RADIUS}
            />
          ))}
        {series.map((serie) => (
          <SeriesBar
            animate={false}
            dataKey={`${serie.id}:count`}
            fill={getChartColor(serie.index)}
            key={serie.id}
            radius={isStacked ? 0 : BAR_RADIUS}
          />
        ))}
        <OPReferences items={chart.references} />
        <OPChartTooltip<TimeSeriesPoint>
          extra={chart.tooltipExtra}
          interval={chart.interval}
          references={chart.references}
          rows={chart.tooltipRows}
          showCrosshair
          showDatePill={false}
        />
        <OPDatePill interval={chart.interval} />
        <PointClick<TimeSeriesPoint> onClick={chart.menu.openMenu} />
      </ComposedChart>
    </TimeSeriesFrame>
  );
}
