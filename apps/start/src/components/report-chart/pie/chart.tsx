import { useVisibleSeries } from '@/hooks/use-visible-series';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { round } from '@/utils/math';
import { getChartColor } from '@/utils/theme';
import { truncate } from '@/utils/truncate';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { AXIS_FONT_PROPS } from '../common/axis';
import { ReportChartTooltip } from '../common/report-chart-tooltip';
import { ReportTable } from '../common/report-table';
import { useReportChartContext } from '../context';

interface Props {
  data: IChartData;
}

export function Chart({ data }: Props) {
  const { isEditMode } = useReportChartContext();
  const { series, setVisibleSeries } = useVisibleSeries(data);

  const sum = series.reduce((acc, serie) => acc + serie.metrics.sum, 0);
  const pieData = series.map((serie) => ({
    id: serie.id,
    color: getChartColor(serie.index),
    index: serie.index,
    name: serie.names.join(' > '),
    count: serie.metrics.sum,
    percent: serie.metrics.sum / sum,
  }));

  return (
    <>
      <div
        className={cn('h-full w-full max-sm:-mx-3', isEditMode && 'card p-4')}
      >
        <ResponsiveContainer>
          <PieChart>
            <Tooltip content={<ReportChartTooltip />} />
            <Pie
              dataKey={'count'}
              data={pieData}
              innerRadius={'50%'}
              outerRadius={'80%'}
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
  payload: { name: string; percent: number };
}) => {
  const RADIAN = Math.PI / 180;
  const radius = 25 + innerRadius + (outerRadius - innerRadius);
  const radiusProcent = innerRadius + (outerRadius - innerRadius) * 0.5;
  const xProcent = cx + radiusProcent * Math.cos(-midAngle * RADIAN);
  const yProcent = cy + radiusProcent * Math.sin(-midAngle * RADIAN);
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  const name = payload.name;
  const percent = round(payload.percent * 100, 1);

  return (
    <>
      <text
        x={xProcent}
        y={yProcent}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        fontWeight={700}
        pointerEvents={'none'}
        {...AXIS_FONT_PROPS}
      >
        {percent}%
      </text>
      <text
        x={x}
        y={y}
        fill={fill}
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        {...AXIS_FONT_PROPS}
      >
        {truncate(name, 20)}
      </text>
    </>
  );
};
