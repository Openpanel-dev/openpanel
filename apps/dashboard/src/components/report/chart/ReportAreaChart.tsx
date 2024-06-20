import React from 'react';
import { useFormatDateInterval } from '@/hooks/useFormatDateInterval';
import { useNumber } from '@/hooks/useNumerFormatter';
import { useRechartDataModel } from '@/hooks/useRechartDataModel';
import { useVisibleSeries } from '@/hooks/useVisibleSeries';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { getYAxisWidth } from './chart-utils';
import { useChartContext } from './ChartProvider';
import { ReportChartTooltip } from './ReportChartTooltip';
import { ReportTable } from './ReportTable';
import { ResponsiveContainer } from './ResponsiveContainer';

interface ReportAreaChartProps {
  data: IChartData;
}

export function ReportAreaChart({ data }: ReportAreaChartProps) {
  const { editMode, lineType, interval } = useChartContext();
  const { series, setVisibleSeries } = useVisibleSeries(data);
  const formatDate = useFormatDateInterval(interval);
  const rechartData = useRechartDataModel(series);
  const number = useNumber();

  return (
    <>
      <div className={cn(editMode && 'card p-4')}>
        <ResponsiveContainer>
          {({ width, height }) => (
            <AreaChart width={width} height={height} data={rechartData}>
              <Tooltip content={<ReportChartTooltip />} />
              <XAxis
                axisLine={false}
                fontSize={12}
                dataKey="date"
                tickFormatter={(m: string) => formatDate(m)}
                tickLine={false}
                allowDuplicatedCategory={false}
              />
              <YAxis
                width={getYAxisWidth(data.metrics.max)}
                fontSize={12}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                tickFormatter={number.short}
              />

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
                        <stop
                          offset="0%"
                          stopColor={color}
                          stopOpacity={0.8}
                        ></stop>
                        <stop
                          offset="100%"
                          stopColor={color}
                          stopOpacity={0.1}
                        ></stop>
                      </linearGradient>
                    </defs>
                    <Area
                      key={serie.id}
                      type={lineType}
                      isAnimationActive={false}
                      strokeWidth={2}
                      dataKey={`${serie.id}:count`}
                      stroke={color}
                      fill={`url(#color${color})`}
                      stackId={'1'}
                      fillOpacity={1}
                    />
                  </React.Fragment>
                );
              })}
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={true}
                vertical={false}
                className="stroke-def-200"
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
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
