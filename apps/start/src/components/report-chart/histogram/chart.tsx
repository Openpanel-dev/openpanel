import { useRechartDataModel } from '@/hooks/use-rechart-data-model';
import { useTheme } from '@/hooks/use-theme';
import { useVisibleSeries } from '@/hooks/use-visible-series';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import { useQuery } from '@tanstack/react-query';
import { BookmarkIcon, UsersIcon } from 'lucide-react';
import React, { useCallback } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { useReportChartContext } from '../context';

interface Props {
  data: IChartData;
}

function BarHover({ x, y, width, height, top, left, right, bottom }: any) {
  const themeMode = useTheme();
  const styles = getComputedStyle(document.documentElement);
  const def100 = styles.getPropertyValue('--def-100');
  const def300 = styles.getPropertyValue('--def-300');
  const bg = themeMode?.theme === 'dark' ? def100 : def300;
  return (
    <rect
      {...{ x, y, width, height, top, left, right, bottom }}
      rx="3"
      fill={bg}
      fillOpacity={0.5}
    />
  );
}

export function Chart({ data }: Props) {
  const {
    isEditMode,
    report: {
      previous,
      interval,
      projectId,
      startDate,
      endDate,
      range,
      series: reportSeries,
      breakdowns,
      options: reportOptions,
    },
    options: { hideXAxis, hideYAxis },
  } = useReportChartContext();

  const histogramOptions =
    reportOptions?.type === 'histogram' ? reportOptions : undefined;
  const isStacked = histogramOptions?.stacked ?? false;
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
                chartType: 'histogram',
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

  return (
    <ReportChartTooltip.TooltipProvider references={references.data}>
      <ChartClickMenu getMenuItems={getMenuItems}>
        <div className={cn('h-full w-full', isEditMode && 'card p-4')}>
          <ResponsiveContainer>
            <BarChart data={rechartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                className="stroke-def-200"
              />
              <Tooltip
                content={<ReportChartTooltip.Tooltip />}
                cursor={<BarHover />}
              />
              <YAxis {...yAxisProps} />
              <XAxis {...xAxisProps} scale={'auto'} type="category" />
              {previous
                ? series.map((serie) => {
                    return (
                      <Bar
                        key={`${serie.id}:prev`}
                        name={`${serie.id}:prev`}
                        dataKey={`${serie.id}:prev:count`}
                        fill={getChartColor(serie.index)}
                        fillOpacity={0.3}
                        radius={5}
                        stackId={isStacked ? 'prev' : undefined}
                      />
                    );
                  })
                : null}
              {series.map((serie) => {
                return (
                  <Bar
                    key={serie.id}
                    name={serie.id}
                    dataKey={`${serie.id}:count`}
                    fill={getChartColor(serie.index)}
                    radius={isStacked ? 0 : 4}
                    fillOpacity={1}
                    stackId={isStacked ? 'current' : undefined}
                  />
                );
              })}
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
            </BarChart>
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
