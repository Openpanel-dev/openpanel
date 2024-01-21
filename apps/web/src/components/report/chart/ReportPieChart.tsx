import { useEffect, useRef, useState } from 'react';
import type { IChartData } from '@/app/_trpc/client';
import { AutoSizer } from '@/components/AutoSizer';
import { useVisibleSeries } from '@/hooks/useVisibleSeries';
import { cn } from '@/utils/cn';
import { round } from '@/utils/math';
import { getChartColor } from '@/utils/theme';
import { Cell, Pie, PieChart, Tooltip } from 'recharts';

import { useChartContext } from './ChartProvider';
import { ReportChartTooltip } from './ReportChartTooltip';
import { ReportTable } from './ReportTable';

interface ReportPieChartProps {
  data: IChartData;
}

const RADIAN = Math.PI / 180;
const renderLabel = ({
  x,
  y,
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  payload,
  ...props
}: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const xx = cx + radius * Math.cos(-midAngle * RADIAN);
  const yy = cy + radius * Math.sin(-midAngle * RADIAN);
  const label = payload.label;
  const percent = round(payload.percent * 100, 1);

  return (
    <>
      <text
        x={xx}
        y={yy}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
      >
        {percent}%
      </text>
      <text
        x={x}
        y={y}
        fill="black"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
      >
        {label}
      </text>
    </>
  );
};

export function ReportPieChart({ data }: ReportPieChartProps) {
  const { editMode } = useChartContext();
  const { series, setVisibleSeries } = useVisibleSeries(data);

  const sum = series.reduce((acc, serie) => acc + serie.metrics.sum, 0);
  // Get max 10 series and than combine others into one
  const pieData = series.map((serie) => {
    return {
      id: serie.name,
      color: getChartColor(serie.index),
      index: serie.index,
      label: serie.name,
      count: serie.metrics.sum,
      percent: serie.metrics.sum / sum,
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
                  outerRadius={height / 2.5}
                  isAnimationActive={false}
                  label={renderLabel}
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
