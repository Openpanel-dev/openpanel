'use client';

import { useRechartDataModel } from '@/hooks/useRechartDataModel';
import { useVisibleSeries } from '@/hooks/useVisibleSeries';
import type { IChartData } from '@/trpc/client';
import { api } from '@/trpc/client';
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
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useXAxisProps, useYAxisProps } from '../common/axis';
import { SolidToDashedGradient } from '../common/linear-gradient';
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
    options: { hideXAxis, hideYAxis },
  } = useReportChartContext();
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
            <YAxis {...yAxisProps} />
            <XAxis {...xAxisProps} />
            <Legend content={<CustomLegend />} />
            <Tooltip content={<ReportChartTooltip />} />
            {series.map((serie) => {
              const color = getChartColor(serie.index);
              return (
                <React.Fragment key={serie.id}>
                  <defs>
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
                    {useDashedLastLine && (
                      <SolidToDashedGradient
                        percentage={lastIntervalPercent}
                        baseColor={color}
                        id={`stroke${color}`}
                      />
                    )}
                  </defs>
                  <Area
                    stackId="1"
                    type={lineType}
                    name={serie.id}
                    dataKey={`${serie.id}:count`}
                    stroke={useDashedLastLine ? `url(#stroke${color})` : color}
                    fill={`url(#color${color})`}
                    isAnimationActive={false}
                    fillOpacity={0.7}
                  />
                  {previous && (
                    <Area
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
