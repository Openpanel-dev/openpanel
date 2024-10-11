'use client';

import { useRechartDataModel } from '@/hooks/useRechartDataModel';
import { useVisibleSeries } from '@/hooks/useVisibleSeries';
import { api } from '@/trpc/client';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import { isSameDay, isSameHour, isSameMonth } from 'date-fns';
import { last } from 'ramda';
import React, { useCallback } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useXAxisProps, useYAxisProps } from '../common/axis';
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
    },
    isEditMode,
    options: { hideXAxis, hideYAxis, maxDomain },
  } = useReportChartContext();
  const dataLength = data.series[0]?.data?.length || 0;
  const references = api.reference.getChartReferences.useQuery(
    {
      projectId,
      startDate,
      endDate,
      range,
    },
    {
      staleTime: 1000 * 60 * 10,
    },
  );
  const { series, setVisibleSeries } = useVisibleSeries(data);
  const rechartData = useRechartDataModel(series);

  // great care should be taken when computing lastIntervalPercent
  // the expression below works for data.length - 1 equal intervals
  // but if there are numeric x values in a "linear" axis, the formula
  // should be updated to use those values
  const lastIntervalPercent =
    ((rechartData.length - 2) * 100) / (rechartData.length - 1);

  const gradientTwoColors = (
    id: string,
    col1: string,
    col2: string,
    percentChange: number,
  ) => (
    <linearGradient id={id} x1="0" y1="0" x2="100%" y2="0">
      <stop offset="0%" stopColor={col1} />
      <stop offset={`${percentChange}%`} stopColor={col1} />
      <stop offset={`${percentChange}%`} stopColor={`${col2}`} />
      <stop offset="100%" stopColor={col2} />
    </linearGradient>
  );

  const lastSerieDataItem = last(series[0]?.data || [])?.date || new Date();
  const useDashedLastLine = (() => {
    if (interval === 'hour') {
      return isSameHour(lastSerieDataItem, new Date());
    }

    if (interval === 'day') {
      return isSameDay(lastSerieDataItem, new Date());
    }

    if (interval === 'month') {
      return isSameMonth(lastSerieDataItem, new Date());
    }

    return false;
  })();

  const CustomLegend = useCallback(() => {
    return (
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
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

  const isAreaStyle = series.length === 1;

  const xAxisProps = useXAxisProps({ interval, hide: hideXAxis });
  const yAxisProps = useYAxisProps({
    data: [data.metrics.max],
    hide: hideYAxis,
  });
  return (
    <>
      <div className={cn('h-full w-full', isEditMode && 'card p-4')}>
        <ResponsiveContainer>
          <ComposedChart data={rechartData}>
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
                stroke={'#94a3b8'}
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
            <YAxis
              {...yAxisProps}
              domain={maxDomain ? [0, maxDomain] : undefined}
            />
            <XAxis {...xAxisProps} />
            {series.length > 1 && (
              <Legend
                wrapperStyle={{ fontSize: '10px' }}
                content={<CustomLegend />}
              />
            )}
            <Tooltip content={<ReportChartTooltip />} />
            {series.map((serie) => {
              const color = getChartColor(serie.index);
              return (
                <React.Fragment key={serie.id}>
                  <defs>
                    {isAreaStyle && (
                      <linearGradient
                        id={`color${color}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor={color} stopOpacity={0.8} />
                        <stop
                          offset="100%"
                          stopColor={color}
                          stopOpacity={0.1}
                        />
                      </linearGradient>
                    )}
                    {gradientTwoColors(
                      `hideAllButLastInterval_${serie.id}`,
                      'rgba(0,0,0,0)',
                      color,
                      lastIntervalPercent,
                    )}
                    {gradientTwoColors(
                      `hideJustLastInterval_${serie.id}`,
                      color,
                      'rgba(0,0,0,0)',
                      lastIntervalPercent,
                    )}
                  </defs>
                  <Line
                    dot={isAreaStyle && dataLength <= 8}
                    type={lineType}
                    name={serie.id}
                    isAnimationActive={false}
                    strokeWidth={2}
                    dataKey={`${serie.id}:count`}
                    stroke={useDashedLastLine ? 'transparent' : color}
                    // Use for legend
                    fill={color}
                  />
                  {isAreaStyle && (
                    <Area
                      dot={false}
                      name={`${serie.id}:area:noTooltip`}
                      dataKey={`${serie.id}:count`}
                      fill={`url(#color${color})`}
                      type={lineType}
                      isAnimationActive={false}
                      strokeWidth={0}
                      fillOpacity={0.1}
                    />
                  )}
                  {useDashedLastLine && (
                    <>
                      <Line
                        dot={false}
                        type={lineType}
                        name={`${serie.id}:dashed:noTooltip`}
                        isAnimationActive={false}
                        strokeWidth={2}
                        dataKey={`${serie.id}:count`}
                        stroke={`url('#hideAllButLastInterval_${serie.id}')`}
                        strokeDasharray="2 4"
                        strokeLinecap="round"
                        strokeOpacity={0.7}
                      />
                      <Line
                        dot={false}
                        type={lineType}
                        name={`${serie.id}:solid:noTooltip`}
                        isAnimationActive={false}
                        strokeWidth={2}
                        dataKey={`${serie.id}:count`}
                        stroke={`url('#hideJustLastInterval_${serie.id}')`}
                      />
                    </>
                  )}
                  {previous && (
                    <Line
                      type={lineType}
                      name={`${serie.id}:prev`}
                      isAnimationActive
                      dot={false}
                      strokeOpacity={0.3}
                      dataKey={`${serie.id}:prev:count`}
                      stroke={color}
                      // Use for legend
                      fill={color}
                    />
                  )}
                </React.Fragment>
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
    </>
  );
}
