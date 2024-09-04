import React from 'react';
import { useFormatDateInterval } from '@/hooks/useFormatDateInterval';
import { useNumber } from '@/hooks/useNumerFormatter';
import { useRechartDataModel } from '@/hooks/useRechartDataModel';
import { useVisibleSeries } from '@/hooks/useVisibleSeries';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor, theme } from '@/utils/theme';
import { useTheme } from 'next-themes';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';

import { getYAxisWidth } from './chart-utils';
import { useChartContext } from './ChartProvider';
import { ReportChartTooltip } from './ReportChartTooltip';
import { ReportTable } from './ReportTable';
import { ResponsiveContainer } from './ResponsiveContainer';

interface ReportHistogramChartProps {
  data: IChartData;
}

function BarHover({ x, y, width, height, top, left, right, bottom }: any) {
  const themeMode = useTheme();
  const bg =
    themeMode?.theme === 'dark'
      ? theme.colors['def-100']
      : theme.colors['def-300'];
  return (
    <rect
      {...{ x, y, width, height, top, left, right, bottom }}
      rx="3"
      fill={bg}
      fillOpacity={0.5}
    />
  );
}

export function ReportHistogramChart({ data }: ReportHistogramChartProps) {
  const { editMode, previous, interval, aspectRatio } = useChartContext();
  const formatDate = useFormatDateInterval(interval);
  const { series, setVisibleSeries } = useVisibleSeries(data);
  const rechartData = useRechartDataModel(series);
  const number = useNumber();

  return (
    <>
      <div className={cn('w-full', editMode && 'card p-4')}>
        <ResponsiveContainer aspectRatio={aspectRatio}>
          {({ width, height }) => (
            <BarChart
              width={width}
              height={height}
              data={rechartData}
              barCategoryGap={10}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                className="stroke-def-200"
              />
              <Tooltip content={<ReportChartTooltip />} cursor={<BarHover />} />
              <XAxis
                fontSize={12}
                dataKey="date"
                tickFormatter={formatDate}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                fontSize={12}
                axisLine={false}
                tickLine={false}
                width={getYAxisWidth(data.metrics.max)}
                allowDecimals={false}
                domain={[0, data.metrics.max]}
                tickFormatter={number.short}
              />
              {series.map((serie) => {
                return (
                  <React.Fragment key={serie.id}>
                    <defs>
                      <linearGradient
                        id="colorGradient"
                        x1="0"
                        y1="1"
                        x2="0"
                        y2="0"
                      >
                        <stop
                          offset="0%"
                          stopColor={getChartColor(serie.index)}
                          stopOpacity={0.7}
                        />
                        <stop
                          offset="100%"
                          stopColor={getChartColor(serie.index)}
                          stopOpacity={1}
                        />
                      </linearGradient>
                    </defs>
                    {previous && (
                      <Bar
                        key={`${serie.id}:prev`}
                        name={`${serie.id}:prev`}
                        dataKey={`${serie.id}:prev:count`}
                        fill={getChartColor(serie.index)}
                        fillOpacity={0.1}
                        radius={3}
                        barSize={20} // Adjust the bar width here
                      />
                    )}
                    <Bar
                      key={serie.id}
                      name={serie.id}
                      dataKey={`${serie.id}:count`}
                      fill="url(#colorGradient)"
                      radius={3}
                      fillOpacity={1}
                      barSize={20} // Adjust the bar width here
                    />
                  </React.Fragment>
                );
              })}
            </BarChart>
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
