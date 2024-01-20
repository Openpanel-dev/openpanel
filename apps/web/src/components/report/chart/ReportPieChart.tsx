import { useEffect, useRef, useState } from 'react';
import type { IChartData } from '@/app/_trpc/client';
import { AutoSizer } from '@/components/AutoSizer';
import { useVisibleSeries } from '@/hooks/useVisibleSeries';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import { Cell, Pie, PieChart, Tooltip } from 'recharts';

import { useChartContext } from './ChartProvider';
import { ReportChartTooltip } from './ReportChartTooltip';
import { ReportTable } from './ReportTable';

interface ReportPieChartProps {
  data: IChartData;
}

export function ReportPieChart({ data }: ReportPieChartProps) {
  const { editMode } = useChartContext();
  const { series, setVisibleSeries } = useVisibleSeries(data);

  // Get max 10 series and than combine others into one
  const pieData = series.map((serie) => {
    return {
      id: serie.name,
      color: getChartColor(serie.index),
      index: serie.index,
      label: serie.name,
      count: serie.metrics.sum,
    };
  });

  return (
    <>
      <div
        className={cn(
          'max-sm:-mx-3',
          editMode && 'border border-border bg-white rounded-md p-4'
        )}
      >
        <AutoSizer disableHeight>
          {({ width }) => {
            const height = Math.min(Math.max(width * 0.5, 250), 400);
            return (
              <PieChart
                width={width}
                height={Math.min(Math.max(width * 0.5, 250), 400)}
              >
                <Tooltip content={<ReportChartTooltip />} />
                <Pie
                  dataKey={'count'}
                  data={pieData}
                  innerRadius={height / 4}
                  outerRadius={height / 2 - 20}
                  isAnimationActive={false}
                >
                  {pieData.map((item) => {
                    return (
                      <Cell
                        key={item.id}
                        strokeWidth={2}
                        stroke={item.color}
                        fill={item.color}
                      />
                    );
                  })}
                </Pie>
              </PieChart>
            );
          }}
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
