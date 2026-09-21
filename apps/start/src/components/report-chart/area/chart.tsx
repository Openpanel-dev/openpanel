import { useQuery } from '@tanstack/react-query';
import { isSameDay, isSameHour, isSameMonth, isSameWeek } from 'date-fns';
import { BookmarkIcon, UsersIcon } from 'lucide-react';
import { last } from 'ramda';
import { useCallback } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Customized,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useXAxisProps, useYAxisProps } from '../common/axis';
import {
  ChartClickMenu,
  type ChartClickMenuItem,
} from '../common/chart-click-menu';
import { ReportChartTooltip } from '../common/report-chart-tooltip';
import { ReportTable } from '../common/report-table';
import { SerieIcon } from '../common/serie-icon';
import { SerieName } from '../common/serie-name';
import { useReportChartContext } from '../context';
import { changeVisibleSeries } from '@/components/report/reportSlice';
import { useDashedStroke } from '@/hooks/use-dashed-stroke';
import { useRechartDataModel } from '@/hooks/use-rechart-data-model';
import { useVisibleSeries } from '@/hooks/use-visible-series';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { useDispatch } from '@/redux';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

interface Props {
  data: IChartData;
}

export function Chart({ data }: Props) {
  const {
    report: {
      previous,
      interval,
      projectId,
      startDate,
      endDate,
      range,
      lineType,
      series: reportSeries,
      breakdowns,
      visibleSeries: savedVisibleSeries,
    },
    isEditMode,
    options: { hideXAxis, hideYAxis },
  } = useReportChartContext();
  const dispatch = useDispatch();
  const trpc = useTRPC();
  const references = useQuery(
    trpc.reference.getChartReferences.queryOptions({
      projectId,
      startDate,
      endDate,
      range,
    })
  );
  const { series, setVisibleSeries } = useVisibleSeries(data, {
    savedVisibleSeries,
    onVisibleSeriesChange: isEditMode
      ? (ids) => dispatch(changeVisibleSeries(ids))
      : undefined,
  });
  const rechartData = useRechartDataModel(series);

  let dotIndex;
  if (range === 'today') {
    // Find closest index based on times
    dotIndex = rechartData.findIndex((item) => {
      return isSameHour(item.date, new Date());
    });
  }

  const lastSerieDataItem = last(series[0]?.data || [])?.date || new Date();
  const useDashedLastLine = (() => {
    if (range === 'today') {
      return true;
    }

    if (interval === 'hour') {
      return isSameHour(lastSerieDataItem, new Date());
    }

    if (interval === 'day') {
      return isSameDay(lastSerieDataItem, new Date());
    }

    if (interval === 'month') {
      return isSameMonth(lastSerieDataItem, new Date());
    }

    if (interval === 'week') {
      return isSameWeek(lastSerieDataItem, new Date());
    }

    return false;
  })();

  const CustomLegend = useCallback(() => {
    return (
      <div className="mt-4 -mb-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
        {series.map((serie) => (
          <div
            className="flex items-center gap-1"
            key={serie.id}
            style={{
              color: getChartColor(serie.index),
            }}
          >
            <SerieIcon name={serie.names} />
            <SerieName name={serie.names} />
          </div>
        ))}
      </div>
    );
  }, [series]);

  const yAxisProps = useYAxisProps({
    hide: hideYAxis,
  });
  const xAxisProps = useXAxisProps({
    hide: hideXAxis,
    interval,
  });

  const getMenuItems = useCallback(
    (e: any, clickedData: any): ChartClickMenuItem[] => {
      const items: ChartClickMenuItem[] = [];

      if (!clickedData?.date) {
        return items;
      }

      // View Users - only show if we have projectId
      if (projectId) {
        items.push({
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
                chartType: 'area',
                metric: 'sum',
              },
              date: clickedData.date,
            });
          },
        });
      }

      // Add Reference - always show
      items.push({
        label: 'Add Reference',
        icon: <BookmarkIcon size={16} />,
        onClick: () => {
          pushModal('AddReference', {
            datetime: new Date(clickedData.date).toISOString(),
          });
        },
      });

      return items;
    },
    [
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

  const { getStrokeDasharray, calcStrokeDasharray, handleAnimationEnd } =
    useDashedStroke({
      dotIndex,
    });

  return (
    <ReportChartTooltip.TooltipProvider references={references.data}>
      <ChartClickMenu getMenuItems={getMenuItems}>
        <div className={cn('h-full w-full', isEditMode && 'card p-4')}>
          <ResponsiveContainer>
            <ComposedChart data={rechartData}>
              <Customized component={calcStrokeDasharray} />
              <Line
                animationDuration={0}
                dataKey="calcStrokeDasharray"
                legendType="none"
                onAnimationEnd={handleAnimationEnd}
              />
              <CartesianGrid
                className="stroke-border"
                horizontal={true}
                strokeDasharray="3 3"
                vertical={false}
              />
              {references.data?.map((ref) => (
                <ReferenceLine
                  fontSize={10}
                  key={ref.id}
                  label={{
                    value: ref.title,
                    position: 'centerTop',
                    fill: '#334155',
                    fontSize: 12,
                  }}
                  stroke={'oklch(from var(--foreground) l c h / 0.1)'}
                  strokeDasharray={'3 3'}
                  x={ref.date.getTime()}
                />
              ))}
              <YAxis {...yAxisProps} />
              <XAxis {...xAxisProps} />
              <Legend content={<CustomLegend />} />
              <Tooltip content={<ReportChartTooltip.Tooltip />} />
              {series.map((serie) => {
                const color = getChartColor(serie.index);
                return (
                  <defs key={`defs-${serie.id}`}>
                    <linearGradient
                      id={`color${color}`}
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={color} stopOpacity={0.8} />
                      <stop
                        offset={'100%'}
                        stopColor={color}
                        stopOpacity={0.1}
                      />
                    </linearGradient>
                  </defs>
                );
              })}
              {series.map((serie) => {
                const color = getChartColor(serie.index);
                return (
                  <Area
                    dataKey={`${serie.id}:count`}
                    fill={`url(#color${color})`}
                    fillOpacity={0.7}
                    isAnimationActive={false}
                    key={serie.id}
                    name={serie.id}
                    stackId="1"
                    stroke={color}
                    strokeDasharray={
                      useDashedLastLine
                        ? getStrokeDasharray(`${serie.id}:count`)
                        : undefined
                    }
                    strokeWidth={2}
                    type={lineType}
                  />
                );
              })}
              {previous &&
                series.map((serie) => {
                  const color = getChartColor(serie.index);
                  return (
                    <Area
                      dataKey={`${serie.id}:prev:count`}
                      fill={color}
                      fillOpacity={0.3}
                      isAnimationActive={false}
                      key={`${serie.id}:prev`}
                      name={`${serie.id}:prev`}
                      stackId="2"
                      stroke={color}
                      strokeOpacity={0.3}
                      type={lineType}
                    />
                  );
                })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {isEditMode && (
          <ReportTable
            data={data}
            setVisibleSeries={setVisibleSeries}
            visibleSeries={series}
          />
        )}
      </ChartClickMenu>
    </ReportChartTooltip.TooltipProvider>
  );
}
