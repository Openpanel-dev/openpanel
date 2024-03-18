import type { IChartData } from '@/app/_trpc/client';
import { AutoSizer } from '@/components/react-virtualized-auto-sizer';
import { useVisibleSeries } from '@/hooks/useVisibleSeries';
import { cn } from '@/utils/cn';
import { round } from '@/utils/math';
import { getChartColor } from '@/utils/theme';
import { truncate } from '@/utils/truncate';
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

  const sum = series.reduce((acc, serie) => acc + serie.metrics.sum, 0);
  const pieData = series.map((serie) => ({
    id: serie.name,
    color: getChartColor(serie.index),
    index: serie.index,
    label: serie.name,
    count: serie.metrics.sum,
    percent: serie.metrics.sum / sum,
  }));

  return (
    <>
      <div className={cn('max-sm:-mx-3', editMode && 'card p-4')}>
        <AutoSizer disableHeight>
          {({ width }) => {
            const height = Math.min(Math.max(width * 0.5625, 250), 400);
            return (
              <PieChart width={width} height={height}>
                <Tooltip content={<ReportChartTooltip />} />
                <Pie
                  dataKey={'count'}
                  data={pieData}
                  innerRadius={height / 4}
                  outerRadius={height / 2.5}
                  isAnimationActive={true}
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

const renderLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  fill,
  payload,
}: {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  fill: string;
  payload: { label: string; percent: number };
}) => {
  const RADIAN = Math.PI / 180;
  const radius = 25 + innerRadius + (outerRadius - innerRadius);
  const radiusProcent = innerRadius + (outerRadius - innerRadius) * 0.5;
  const xProcent = cx + radiusProcent * Math.cos(-midAngle * RADIAN);
  const yProcent = cy + radiusProcent * Math.sin(-midAngle * RADIAN);
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  const label = payload.label;
  const percent = round(payload.percent * 100, 1);

  return (
    <>
      <text
        x={xProcent}
        y={yProcent}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fontWeight={700}
        pointerEvents={'none'}
      >
        {percent}%
      </text>
      <text
        x={x}
        y={y}
        fill={fill}
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={10}
      >
        {truncate(label, 20)}
      </text>
    </>
  );
};
