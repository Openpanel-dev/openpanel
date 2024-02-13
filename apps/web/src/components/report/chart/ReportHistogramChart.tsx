import React from 'react';
import type { IChartData } from '@/app/_trpc/client';
import { AutoSizer } from '@/components/AutoSizer';
import { useFormatDateInterval } from '@/hooks/useFormatDateInterval';
import { useRechartDataModel } from '@/hooks/useRechartDataModel';
import { useVisibleSeries } from '@/hooks/useVisibleSeries';
import type { IInterval } from '@/types';
import { cn } from '@/utils/cn';
import { getChartColor, theme } from '@/utils/theme';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';

import { getYAxisWidth } from './chart-utils';
import { useChartContext } from './ChartProvider';
import { ReportChartTooltip } from './ReportChartTooltip';
import { ReportTable } from './ReportTable';

interface ReportHistogramChartProps {
  data: IChartData;
  interval: IInterval;
}

function BarHover({ x, y, width, height, top, left, right, bottom }: any) {
  const bg = theme?.colors?.slate?.['200'] as string;
  return (
    <rect
      {...{ x, y, width, height, top, left, right, bottom }}
      rx="8"
      fill={bg}
      fillOpacity={0.5}
    />
  );
}

export function ReportHistogramChart({
  interval,
  data,
}: ReportHistogramChartProps) {
  const { editMode, previous } = useChartContext();
  const formatDate = useFormatDateInterval(interval);
  const { series, setVisibleSeries } = useVisibleSeries(data);

  const rechartData = useRechartDataModel(series);

  return (
    <>
      <div
        className={cn(
          'max-sm:-mx-3 aspect-video w-full max-h-[400px] min-h-[200px]',
          editMode && 'border border-border bg-white rounded-md p-4'
        )}
      >
        <AutoSizer disableHeight>
          {({ width }) => (
            <BarChart
              width={width}
              height={Math.min(Math.max(width * 0.5625, 250), 400)}
              data={rechartData}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
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
              />
              {series.map((serie) => {
                return (
                  <React.Fragment key={serie.name}>
                    {previous && (
                      <Bar
                        key={`${serie.name}:prev`}
                        name={`${serie.name}:prev`}
                        dataKey={`${serie.index}:prev:count`}
                        fill={getChartColor(serie.index)}
                        fillOpacity={0.2}
                        radius={8}
                      />
                    )}
                    <Bar
                      key={serie.name}
                      name={serie.name}
                      dataKey={`${serie.index}:count`}
                      fill={getChartColor(serie.index)}
                      radius={8}
                    />
                  </React.Fragment>
                );
              })}
            </BarChart>
          )}
        </AutoSizer>
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
