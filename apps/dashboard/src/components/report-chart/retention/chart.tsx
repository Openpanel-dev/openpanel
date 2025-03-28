'use client';

import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { average, round } from '@openpanel/common';
import { useXAxisProps, useYAxisProps } from '../common/axis';
import { useReportChartContext } from '../context';
import { RetentionTooltip } from './tooltip';

interface Props {
  data: RouterOutputs['chart']['cohort'];
}

export function Chart({ data }: Props) {
  const {
    report: { interval },
    isEditMode,
    options: { hideXAxis, hideYAxis },
  } = useReportChartContext();

  const xAxisProps = useXAxisProps({ interval, hide: hideXAxis });
  const yAxisProps = useYAxisProps({
    hide: hideYAxis,
    tickFormatter: (value) => `${value}%`,
  });
  const averageRow = data[0];
  const averageRetentionRate =
    average(averageRow?.percentages || [], true) * 100;
  const rechartData = averageRow?.percentages.map((item, index) => ({
    days: index,
    percentage: item * 100,
    value: averageRow.values?.[index],
    sum: averageRow.sum,
  }));

  return (
    <>
      <div className={cn('h-full w-full', isEditMode && 'card p-4')}>
        <ResponsiveContainer>
          <ComposedChart data={rechartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={true}
              vertical={true}
              className="stroke-border"
            />
            <YAxis {...yAxisProps} dataKey="retentionRate" domain={[0, 100]} />
            <XAxis
              {...xAxisProps}
              dataKey="days"
              allowDuplicatedCategory
              scale="linear"
              tickFormatter={(value) => value.toString()}
              tickCount={31}
              interval={0}
            />
            <Tooltip content={<RetentionTooltip />} />
            <defs>
              <linearGradient id={'color'} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={getChartColor(0)}
                  stopOpacity={0.8}
                />
                <stop
                  offset="100%"
                  stopColor={getChartColor(0)}
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <ReferenceLine
              y={averageRetentionRate}
              stroke={getChartColor(1)}
              strokeWidth={2}
              strokeDasharray="3 3"
              strokeOpacity={0.5}
              strokeLinecap="round"
              label={{
                value: `Average (${round(averageRetentionRate, 2)} %)`,
                fill: getChartColor(1),
                position: 'insideBottomRight',
                fontSize: 12,
              }}
            />
            <Area
              dataKey="percentage"
              fill={'url(#color)'}
              type={'monotone'}
              isAnimationActive={false}
              strokeWidth={2}
              stroke={getChartColor(0)}
              fillOpacity={0.1}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
