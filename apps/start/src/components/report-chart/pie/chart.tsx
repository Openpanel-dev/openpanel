import { useVisibleSeries } from '@/hooks/use-visible-series';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { round } from '@/utils/math';
import { getChartColor } from '@/utils/theme';
import { truncate } from '@/utils/truncate';
import { Fragment } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { useNumber } from '@/hooks/use-numer-formatter';
import { formatDate } from '@/utils/date';
import { AXIS_FONT_PROPS } from '../common/axis';
import { PreviousDiffIndicator } from '../common/previous-diff-indicator';
import { ReportChartTooltip } from '../common/report-chart-tooltip';
import { ReportTable } from '../common/report-table';
import { SerieIcon } from '../common/serie-icon';
import { SerieName } from '../common/serie-name';
import { useReportChartContext } from '../context';

interface Props {
  data: IChartData;
}

const PieTooltip = (props: { payload?: any[] }) => {
  const number = useNumber();
  return (
    <div className="bg-background/80 p-2 rounded-md backdrop-blur-md border min-w-[180px]">
      {props.payload?.map((serie, index) => {
        const item = serie.payload;
        return (
          <Fragment key={item.id}>
            {index === 0 && item.date && (
              <div className="flex justify-between gap-8">
                <div>{formatDate(new Date(item.date))}</div>
              </div>
            )}
            <div className="flex gap-2">
              <div
                className="w-[3px] rounded-full"
                style={{ background: item.color }}
              />
              <div className="col flex-1 gap-1">
                <div className="flex items-center gap-1">
                  <SerieIcon name={item.name} />
                  <SerieName name={item.names} className="font-medium" />
                </div>
                <div className="flex justify-between gap-8 font-mono font-medium">
                  <div className="row gap-1">
                    {number.formatWithUnit(item.count)}
                    {!!item.previous && (
                      <span className="text-muted-foreground">
                        ({number.formatWithUnit(item.previous.sum.value)})
                      </span>
                    )}
                  </div>
                  <PreviousDiffIndicator {...item.previous?.sum} />
                </div>
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
};

export function Chart({ data }: Props) {
  const { isEditMode } = useReportChartContext();
  const { series, setVisibleSeries } = useVisibleSeries(data);

  const sum = series.reduce((acc, serie) => acc + serie.metrics.sum, 0);
  const pieData = series.map((serie) => ({
    id: serie.id,
    color: getChartColor(serie.index),
    index: serie.index,
    name: serie.names.join(' > '),
    names: serie.names,
    count: serie.metrics.sum,
    percent: serie.metrics.sum / sum,
    previous: serie.metrics.previous ? serie.metrics.previous : undefined,
  }));

  return (
    <>
      <div
        className={cn('h-full w-full max-sm:-mx-3', isEditMode && 'card p-4')}
      >
        <ResponsiveContainer>
          <PieChart>
            <Tooltip content={<PieTooltip />} />
            <Pie
              dataKey={'count'}
              data={pieData}
              innerRadius={'30%'}
              outerRadius={'80%'}
              isAnimationActive={false}
              label={renderLabel}
            >
              {pieData.map((item) => {
                return (
                  <Cell
                    key={item.id}
                    strokeWidth={2}
                    stroke={'#fff'}
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
        pointerEvents={'none'}
        {...AXIS_FONT_PROPS}
        fontSize={12}
        fontWeight={700}
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
        fontSize={10}
        fontWeight={700}
      >
        {truncate(name, 20)}
      </text>
    </>
  );
};
