import { useRechartDataModel } from '@/hooks/use-rechart-data-model';
import { useVisibleSeries } from '@/hooks/use-visible-series';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
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

import { useDashedStroke } from '@/hooks/use-dashed-stroke';
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
    },
    isEditMode,
    options: { hideXAxis, hideYAxis },
  } = useReportChartContext();
  const trpc = useTRPC();
  const references = useQuery(
    trpc.reference.getChartReferences.queryOptions(
      {
        projectId,
        startDate,
        endDate,
        range,
      },
      {
        staleTime: 1000 * 60 * 10,
      },
    ),
  );
  const { series, setVisibleSeries } = useVisibleSeries(data);
  const rechartData = useRechartDataModel(series);

  let dotIndex = undefined;
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
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs mt-4 -mb-2">
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
    ],
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
                dataKey="calcStrokeDasharray"
                legendType="none"
                animationDuration={0}
                onAnimationEnd={handleAnimationEnd}
              />
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={true}
                vertical={false}
                className="stroke-border"
              />
              {references.data?.map((ref) => (
                <ReferenceLine
                  key={ref.id}
                  x={ref.date.getTime()}
                  stroke={'oklch(from var(--foreground) l c h / 0.1)'}
                  strokeDasharray={'3 3'}
                  label={{
                    value: ref.title,
                    position: 'centerTop',
                    fill: '#334155',
                    fontSize: 12,
                  }}
                  fontSize={10}
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
                      y1="0"
                      x2="0"
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
                    key={serie.id}
                    stackId="1"
                    type={lineType}
                    name={serie.id}
                    dataKey={`${serie.id}:count`}
                    strokeDasharray={
                      useDashedLastLine
                        ? getStrokeDasharray(`${serie.id}:count`)
                        : undefined
                    }
                    fill={`url(#color${color})`}
                    stroke={color}
                    strokeWidth={2}
                    isAnimationActive={false}
                    fillOpacity={0.7}
                  />
                );
              })}
              {previous &&
                series.map((serie) => {
                  const color = getChartColor(serie.index);
                  return (
                    <Area
                      key={`${serie.id}:prev`}
                      stackId="2"
                      type={lineType}
                      name={`${serie.id}:prev`}
                      dataKey={`${serie.id}:prev:count`}
                      stroke={color}
                      fill={color}
                      fillOpacity={0.3}
                      strokeOpacity={0.3}
                      isAnimationActive={false}
                    />
                  );
                })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {isEditMode && (
          <ReportTable
            data={data}
            visibleSeries={series}
            setVisibleSeries={setVisibleSeries}
          />
        )}
      </ChartClickMenu>
    </ReportChartTooltip.TooltipProvider>
  );
}
