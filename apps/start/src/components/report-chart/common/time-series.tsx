import type { IChartType } from '@openpanel/core/modules/report/report.constants';
import { useQuery } from '@tanstack/react-query';
import { BookmarkIcon, UsersIcon } from 'lucide-react';
import { type ReactNode, useCallback, useRef } from 'react';
import { useReportChartContext } from '../context';
import {
  ChartClickMenu,
  type ChartClickMenuHandle,
  type ChartClickMenuItem,
} from './chart-click-menu';
import { getCurve } from './curve';
import { SerieIcon } from './serie-icon';
import { SerieName } from './serie-name';
import { useDashedTail } from '@/components/charts/op-dashed-tail';
import type { OPTooltipRow } from '@/components/charts/op-tooltip';
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

export type TimeSeriesPoint = Record<string, unknown> & { date: string };

/** What the line, area and histogram report charts share around their bklit chart. */
export function useTimeSeriesChart({
  data,
  series,
  chartType,
}: {
  data: IChartData;
  series: IVisibleSeries;
  chartType: IChartType;
}) {
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
  const chartData = useRechartDataModel(series) as TimeSeriesPoint[];
  const dashFromIndex = useDashedTail({ data: chartData, range, interval });

  const formatDateLabel = useCallback(
    (date: Date) => formatDateInterval({ interval, date, short: true }),
    [interval]
  );
  const formatValue = useCallback(
    (value: number) => number.formatWithUnit(value, unit),
    [number, unit]
  );

  const tooltipRows = useCallback(
    (point: TimeSeriesPoint): OPTooltipRow[] =>
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
  const tooltipExtra = useCallback(
    (point: TimeSeriesPoint) => {
      const hidden =
        seriesPayloads(point, series).length - TOOLTIP_SERIES_LIMIT;
      if (hidden <= 0) {
        return null;
      }
      return (
        <div className="text-muted-foreground text-sm">
          and {hidden} more...
        </div>
      );
    },
    [series]
  );

  const menuRef = useRef<ChartClickMenuHandle>(null);
  const getMenuItems = useCallback(
    (
      _event: unknown,
      clickedData: TimeSeriesPoint | null
    ): ChartClickMenuItem[] => {
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
                chartType,
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
      chartType,
    ]
  );
  const openMenu = useCallback((point: TimeSeriesPoint, event: MouseEvent) => {
    menuRef.current?.openAt(point, event.clientX, event.clientY);
  }, []);

  return {
    chartData,
    references: references.data,
    previous,
    interval,
    hideXAxis,
    hideYAxis,
    dashFromIndex,
    curve: getCurve(lineType),
    showMarkers: chartData.length <= MARKERS_MAX_POINTS,
    margin: hideXAxis && hideYAxis ? BARE_MARGIN : AXIS_MARGIN,
    formatDateLabel,
    formatAxisValue: number.short,
    tooltipRows,
    tooltipExtra,
    menu: { ref: menuRef, getMenuItems, openMenu },
  };
}

export function previousPeriodColor(index: number) {
  return `color-mix(in oklch, ${getChartColor(index)} ${PREVIOUS_PERIOD_OPACITY}, transparent)`;
}

/** The click menu, the card in the editor, and a legend under the chart when there is more than one series. */
export function TimeSeriesFrame({
  chartType,
  series,
  menu,
  children,
}: {
  chartType: IChartType;
  series: IVisibleSeries;
  menu: ReturnType<typeof useTimeSeriesChart>['menu'];
  children: ReactNode;
}) {
  const { isEditMode } = useReportChartContext();
  return (
    <ChartClickMenu getMenuItems={menu.getMenuItems} ref={menu.ref}>
      <div className={cn('col h-full w-full', isEditMode && 'card p-4')}>
        <div
          className="min-h-0 flex-1"
          data-report-chart={chartType}
          data-visible-series={series.length}
        >
          {children}
        </div>
        {series.length > 1 && <SeriesLegend series={series} />}
      </div>
    </ChartClickMenu>
  );
}

function SeriesLegend({ series }: { series: IVisibleSeries }) {
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

function seriesPayloads(point: TimeSeriesPoint, series: IVisibleSeries) {
  return series
    .flatMap((serie) => {
      const payload = point[`${serie.id}:payload`] as
        | IRechartPayloadItem
        | undefined;
      return payload ? [{ payload, color: getChartColor(serie.index) }] : [];
    })
    .sort((a, b) => (b.payload.count || 0) - (a.payload.count || 0));
}
