import { useMemo } from 'react';
import { PointClick } from '../common/point-click';
import {
  POINT_MARKER,
  previousPeriodColor,
  TimeSeriesFrame,
  type TimeSeriesPoint,
  useTimeSeriesChart,
} from '../common/time-series';
import { Area, AreaChart } from '@/components/charts/area-chart';
import { Grid } from '@/components/charts/grid';
import { OPDatePill } from '@/components/charts/op-date-pill';
import { OPReferences } from '@/components/charts/op-references';
import { OPChartTooltip } from '@/components/charts/op-tooltip';
import { XAxis } from '@/components/charts/x-axis';
import { YAxis } from '@/components/charts/y-axis';
import type { IVisibleSeries } from '@/hooks/use-visible-series';
import type { IChartData } from '@/trpc/client';
import { getChartColor } from '@/utils/theme';

const AREA_FILL_OPACITY = 0.5;
const PREVIOUS_FILL_OPACITY = 0.15;

interface Props {
  data: IChartData;
  series: IVisibleSeries;
}

export function Chart({ data, series }: Props) {
  const chart = useTimeSeriesChart({ data, series, chartType: 'area' });
  const stackedData = useMemo(
    () => stackSeries(chart.chartData, series),
    [chart.chartData, series]
  );

  return (
    <TimeSeriesFrame chartType="area" menu={chart.menu} series={series}>
      <AreaChart
        animationDuration={0}
        aspectRatio="auto"
        className="h-full"
        data={stackedData}
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
            <Area
              animate={false}
              baselineKey={stackKeys(serie.id, 'prev').base}
              curve={chart.curve}
              dataKey={stackKeys(serie.id, 'prev').top}
              fill={previousPeriodColor(serie.index)}
              fillOpacity={PREVIOUS_FILL_OPACITY}
              key={`${serie.id}:prev`}
              showHighlight={false}
              showLine={false}
            />
          ))}
        {series.map((serie) => (
          <Area
            animate={false}
            baselineKey={stackKeys(serie.id).base}
            curve={chart.curve}
            dashArray="4,4"
            dashFromIndex={chart.dashFromIndex}
            dataKey={stackKeys(serie.id).top}
            fill={getChartColor(serie.index)}
            fillOpacity={AREA_FILL_OPACITY}
            key={serie.id}
            markers={POINT_MARKER}
            showMarkers={chart.showMarkers}
            stroke={getChartColor(serie.index)}
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
          showDots
        />
        <OPDatePill interval={chart.interval} />
        <PointClick<TimeSeriesPoint> onClick={chart.menu.openMenu} />
      </AreaChart>
    </TimeSeriesFrame>
  );
}

function stackKeys(serieId: string, period?: 'prev') {
  const prefix = period ? `${serieId}:${period}` : serieId;
  return {
    value: `${prefix}:count`,
    top: `${prefix}:stack`,
    base: `${prefix}:stack-base`,
  };
}

/** Adds a top and a base per series so each area sits on the ones before it. */
function stackSeries(points: TimeSeriesPoint[], series: IVisibleSeries) {
  return points.map((point) => {
    const stacked: TimeSeriesPoint = { ...point };
    for (const period of [undefined, 'prev'] as const) {
      let total = 0;
      for (const serie of series) {
        const keys = stackKeys(serie.id, period);
        const value = point[keys.value];
        if (typeof value !== 'number') {
          continue;
        }
        stacked[keys.base] = total;
        total += value;
        stacked[keys.top] = total;
      }
    }
    return stacked;
  });
}
