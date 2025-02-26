import { useRechartDataModel } from '@/hooks/useRechartDataModel';
import { useVisibleSeries } from '@/hooks/useVisibleSeries';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor, theme } from '@/utils/theme';
import { useTheme } from 'next-themes';
import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useXAxisProps, useYAxisProps } from '../common/axis';
import { ReportChartTooltip } from '../common/report-chart-tooltip';
import { ReportTable } from '../common/report-table';
import { useReportChartContext } from '../context';

interface Props {
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

export function Chart({ data }: Props) {
  const {
    isEditMode,
    report: { previous, interval },
    options: { hideXAxis, hideYAxis },
  } = useReportChartContext();
  const { series, setVisibleSeries } = useVisibleSeries(data);
  const rechartData = useRechartDataModel(series);
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
          <BarChart data={rechartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              className="stroke-def-200"
            />
            <Tooltip content={<ReportChartTooltip />} cursor={<BarHover />} />
            <YAxis {...yAxisProps} />
            <XAxis {...xAxisProps} scale={'auto'} type="category" />
            {series.map((serie) => {
              return (
                <React.Fragment key={serie.id}>
                  {previous && (
                    <Bar
                      key={`${serie.id}:prev`}
                      name={`${serie.id}:prev`}
                      dataKey={`${serie.id}:prev:count`}
                      fill={getChartColor(serie.index)}
                      fillOpacity={0.1}
                      radius={3}
                      barSize={5} // Adjust the bar width here
                    />
                  )}
                  <Bar
                    key={serie.id}
                    name={serie.id}
                    dataKey={`${serie.id}:count`}
                    fill={getChartColor(serie.index)}
                    radius={3}
                    fillOpacity={1}
                    barSize={5} // Adjust the bar width here
                  />
                </React.Fragment>
              );
            })}
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
    </>
  );
}
