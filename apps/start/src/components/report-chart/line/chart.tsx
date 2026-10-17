import { PointClick } from '../common/point-click';
import {
  POINT_MARKER,
  previousPeriodColor,
  TimeSeriesFrame,
  type TimeSeriesPoint,
  useTimeSeriesChart,
} from '../common/time-series';
import { Grid } from '@/components/charts/grid';
import { Line, LineChart } from '@/components/charts/line-chart';
import { OPReferences } from '@/components/charts/op-references';
import { OPChartTooltip } from '@/components/charts/op-tooltip';
import { XAxis } from '@/components/charts/x-axis';
import { YAxis } from '@/components/charts/y-axis';
import type { IVisibleSeries } from '@/hooks/use-visible-series';
import type { IChartData } from '@/trpc/client';
import { getChartColor } from '@/utils/theme';

interface Props {
  data: IChartData;
  series: IVisibleSeries;
}

export function Chart({ data, series }: Props) {
  const chart = useTimeSeriesChart({ data, series, chartType: 'linear' });

  return (
    <TimeSeriesFrame chartType="linear" menu={chart.menu} series={series}>
      <LineChart
        animationDuration={0}
        aspectRatio="auto"
        className="h-full"
        data={chart.chartData}
        formatDateLabel={chart.formatDateLabel}
        margin={chart.margin}
        style={{ touchAction: 'pan-y' }}
        xDataKey="date"
      >
        <Grid horizontal />
        {!chart.hideYAxis && <YAxis formatValue={chart.formatAxisValue} />}
        {!chart.hideXAxis && <XAxis />}
        {chart.previous &&
          series.map((serie) => (
            <Line
              animate={false}
              curve={chart.curve}
              dataKey={`${serie.id}:prev:count`}
              key={`${serie.id}:prev`}
              showHighlight={false}
              stroke={previousPeriodColor(serie.index)}
              strokeWidth={1.5}
            />
          ))}
        {series.map((serie) => (
          <Line
            animate={false}
            curve={chart.curve}
            dashArray="4,4"
            dashFromIndex={chart.dashFromIndex}
            dataKey={`${serie.id}:count`}
            key={serie.id}
            markers={POINT_MARKER}
            showMarkers={chart.showMarkers}
            stroke={getChartColor(serie.index)}
            strokeWidth={2}
          />
        ))}
        <OPReferences items={chart.references} />
        <OPChartTooltip<TimeSeriesPoint>
          extra={chart.tooltipExtra}
          interval={chart.interval}
          references={chart.references}
          rows={chart.tooltipRows}
          showCrosshair
          showDots
        />
        <PointClick<TimeSeriesPoint> onClick={chart.menu.openMenu} />
      </LineChart>
    </TimeSeriesFrame>
  );
}
