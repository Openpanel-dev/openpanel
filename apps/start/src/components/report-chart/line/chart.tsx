import { useQuery } from '@tanstack/react-query';
import { BookmarkIcon, UsersIcon } from 'lucide-react';
import { useCallback, useRef } from 'react';
import {
  ChartClickMenu,
  type ChartClickMenuHandle,
  type ChartClickMenuItem,
} from '../common/chart-click-menu';
import { getCurve } from '../common/curve';
import { PointClick } from '../common/point-click';
import { SerieIcon } from '../common/serie-icon';
import { SerieName } from '../common/serie-name';
import { useReportChartContext } from '../context';
import { Grid } from '@/components/charts/grid';
import { Line, LineChart } from '@/components/charts/line-chart';
import { useDashedTail } from '@/components/charts/op-dashed-tail';
import { OPReferences } from '@/components/charts/op-references';
import {
  OPChartTooltip,
  type OPTooltipRow,
} from '@/components/charts/op-tooltip';
import { XAxis } from '@/components/charts/x-axis';
import { YAxis } from '@/components/charts/y-axis';
import { formatDateInterval } from '@/hooks/use-format-date-interval';
import { useNumber } from '@/hooks/use-numer-formatter';
import {
  type IRechartPayloadItem,
  useRechartDataModel,
} from '@/hooks/use-rechart-data-model';
import type { IVisibleSeries } from '@/hooks/use-visible-series';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

const TOOLTIP_SERIES_LIMIT = 3;
const MARKERS_MAX_POINTS = 8;
const PREVIOUS_PERIOD_OPACITY = '30%';
const AXIS_MARGIN = { top: 12, right: 12, bottom: 28, left: 40 };
const BARE_MARGIN = { top: 12, right: 12, bottom: 12, left: 12 };

interface Props {
  data: IChartData;
  series: IVisibleSeries;
}

type ChartPoint = Record<string, unknown> & { date: string };

export function Chart({ data, series }: Props) {
  const {
    report: {
      previous,
      interval,
      projectId,
      startDate,
      endDate,
      range,
      lineType,
      unit,
      series: reportSeries,
      breakdowns,
    },
    isEditMode,
    shareId,
    options: { hideXAxis, hideYAxis },
  } = useReportChartContext();
  const trpc = useTRPC();
  const number = useNumber();
  const references = useQuery(
    trpc.reference.getChartReferences.queryOptions({
      projectId,
      startDate,
      endDate,
      range,
    })
  );
  const chartData = useRechartDataModel(series) as ChartPoint[];
  const dashFromIndex = useDashedTail({ data: chartData, range, interval });
  const curve = getCurve(lineType);
  const showMarkers = chartData.length <= MARKERS_MAX_POINTS;
  const hideAxes = hideXAxis && hideYAxis;

  const formatDateLabel = useCallback(
    (date: Date) => formatDateInterval({ interval, date, short: true }),
    [interval]
  );
  const formatValue = useCallback(
    (value: number) => number.formatWithUnit(value, unit),
    [number, unit]
  );

  const tooltipRows = useCallback(
    (point: ChartPoint): OPTooltipRow[] =>
      seriesPayloads(point, series)
        .slice(0, TOOLTIP_SERIES_LIMIT)
        .map(({ payload, color }) => ({
          color,
          icon: <SerieIcon name={payload.names} />,
          label: <SerieName name={payload.names} />,
          value: payload.count,
          previous: payload.previous?.value,
          format: formatValue,
        })),
    [series, formatValue]
  );

  const menuRef = useRef<ChartClickMenuHandle>(null);

  const getMenuItems = useCallback(
    (_event: unknown, clickedData: ChartPoint | null): ChartClickMenuItem[] => {
      // Both actions need a signed-in member, which a share visitor is not.
      if (shareId || !clickedData?.date) {
        return [];
      }
      return [
        {
          label: 'View Users',
          icon: <UsersIcon size={16} />,
          onClick: () => {
            pushModal('ViewChartUsers', {
              type: 'chart',
              chartData: data,
              report: {
                projectId,
                series: reportSeries,
                breakdowns: breakdowns || [],
                interval,
                startDate,
                endDate,
                range,
                previous,
                chartType: 'linear',
                metric: 'sum',
              },
              date: clickedData.date,
            });
          },
        },
        {
          label: 'Add Reference',
          icon: <BookmarkIcon size={16} />,
          onClick: () => {
            pushModal('AddReference', {
              datetime: new Date(clickedData.date).toISOString(),
            });
          },
        },
      ];
    },
    [
      shareId,
      projectId,
      data,
      reportSeries,
      breakdowns,
      interval,
      startDate,
      endDate,
      range,
      previous,
    ]
  );

  const openMenu = useCallback((point: ChartPoint, event: MouseEvent) => {
    menuRef.current?.openAt(point, event.clientX, event.clientY);
  }, []);

  return (
    <ChartClickMenu getMenuItems={getMenuItems} ref={menuRef}>
      <div className={cn('col h-full w-full', isEditMode && 'card p-4')}>
        <div
          className="min-h-0 flex-1"
          data-report-chart="linear"
          data-visible-series={series.length}
        >
          <LineChart
            animationDuration={0}
            aspectRatio="auto"
            className="h-full"
            data={chartData}
            formatDateLabel={formatDateLabel}
            margin={hideAxes ? BARE_MARGIN : AXIS_MARGIN}
            style={{ touchAction: 'pan-y' }}
            xDataKey="date"
          >
            <Grid horizontal />
            {!hideYAxis && <YAxis formatValue={number.short} />}
            {!hideXAxis && <XAxis />}
            {previous &&
              series.map((serie) => (
                <Line
                  animate={false}
                  curve={curve}
                  dataKey={`${serie.id}:prev:count`}
                  key={`${serie.id}:prev`}
                  showHighlight={false}
                  stroke={`color-mix(in oklch, ${getChartColor(serie.index)} ${PREVIOUS_PERIOD_OPACITY}, transparent)`}
                  strokeWidth={1.5}
                />
              ))}
            {series.map((serie) => (
              <Line
                animate={false}
                curve={curve}
                dashArray="4,4"
                dashFromIndex={dashFromIndex}
                dataKey={`${serie.id}:count`}
                key={serie.id}
                showMarkers={showMarkers}
                stroke={getChartColor(serie.index)}
                strokeWidth={2}
              />
            ))}
            <OPReferences items={references.data} />
            <OPChartTooltip<ChartPoint>
              extra={(point) => {
                const hidden =
                  seriesPayloads(point, series).length - TOOLTIP_SERIES_LIMIT;
                return hidden > 0 ? (
                  <div className="text-muted-foreground text-sm">
                    and {hidden} more...
                  </div>
                ) : null;
              }}
              interval={interval}
              references={references.data}
              rows={tooltipRows}
              showCrosshair
              showDots
            />
            <PointClick<ChartPoint> onClick={openMenu} />
          </LineChart>
        </div>
        {series.length > 1 && <Legend series={series} />}
      </div>
    </ChartClickMenu>
  );
}

function seriesPayloads(point: ChartPoint, series: IVisibleSeries) {
  return series
    .flatMap((serie) => {
      const payload = point[`${serie.id}:payload`] as
        | IRechartPayloadItem
        | undefined;
      return payload ? [{ payload, color: getChartColor(serie.index) }] : [];
    })
    .sort((a, b) => (b.payload.count || 0) - (a.payload.count || 0));
}

function Legend({ series }: { series: IVisibleSeries }) {
  return (
    <div className="flex shrink-0 flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-xs">
      {series.map((serie) => (
        <div
          className="flex items-center gap-1"
          key={serie.id}
          style={{ color: getChartColor(serie.index) }}
        >
          <SerieIcon name={serie.names} />
          <SerieName className="font-semibold" name={serie.names} />
        </div>
      ))}
    </div>
  );
}
