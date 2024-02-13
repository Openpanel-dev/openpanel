'use client';

import React from 'react';
import type { IChartData } from '@/app/_trpc/client';
import { AutoSizer } from '@/components/AutoSizer';
import { useFormatDateInterval } from '@/hooks/useFormatDateInterval';
import { useRechartDataModel } from '@/hooks/useRechartDataModel';
import { useVisibleSeries } from '@/hooks/useVisibleSeries';
import type { IChartLineType, IInterval } from '@/types';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { getYAxisWidth } from './chart-utils';
import { useChartContext } from './ChartProvider';
import { ReportChartTooltip } from './ReportChartTooltip';
import { ReportTable } from './ReportTable';
import { ResponsiveContainer } from './ResponsiveContainer';

interface ReportLineChartProps {
  data: IChartData;
  interval: IInterval;
  lineType: IChartLineType;
}

export function ReportLineChart({
  lineType,
  interval,
  data,
}: ReportLineChartProps) {
  const { editMode, previous } = useChartContext();
  const formatDate = useFormatDateInterval(interval);
  const { series, setVisibleSeries } = useVisibleSeries(data);
  const rechartData = useRechartDataModel(series);

  return (
    <>
      <ResponsiveContainer>
        {({ width, height }) => (
          <LineChart width={width} height={height} data={rechartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={true}
              vertical={false}
            />
            <YAxis
              width={getYAxisWidth(data.metrics.max)}
              fontSize={12}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<ReportChartTooltip />} />
            <XAxis
              axisLine={false}
              fontSize={12}
              dataKey="date"
              tickFormatter={(m: string) => formatDate(m)}
              tickLine={false}
              allowDuplicatedCategory={false}
            />
            {series.map((serie) => {
              return (
                <React.Fragment key={serie.name}>
                  <Line
                    type={lineType}
                    key={serie.name}
                    name={serie.name}
                    isAnimationActive={true}
                    strokeWidth={2}
                    dataKey={`${serie.index}:count`}
                    stroke={getChartColor(serie.index)}
                  />
                  {previous && (
                    <Line
                      type={lineType}
                      key={`${serie.name}:prev`}
                      name={`${serie.name}:prev`}
                      isAnimationActive={true}
                      strokeWidth={1}
                      dot={false}
                      strokeDasharray={'6 6'}
                      dataKey={`${serie.index}:prev:count`}
                      stroke={getChartColor(serie.index)}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </LineChart>
        )}
      </ResponsiveContainer>
      {editMode && (
        <ReportTable
          data={data}
          visibleSeries={series}
          setVisibleSeries={setVisibleSeries}
        />
      )}
    </>
  );
}
