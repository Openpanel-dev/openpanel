import { average, round } from '@openpanel/shared';
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
import { useXAxisProps, useYAxisProps } from '../common/axis';
import { useReportChartContext } from '../context';
import { RetentionTooltip } from './tooltip';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

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
              className="stroke-border"
              horizontal={true}
              strokeDasharray="3 3"
              vertical={true}
            />
            <YAxis {...yAxisProps} dataKey="retentionRate" domain={[0, 100]} />
            <XAxis
              {...xAxisProps}
              allowDuplicatedCategory
              dataKey="days"
              interval={0}
              scale="linear"
              tickCount={31}
              tickFormatter={(value) => value.toString()}
            />
            <Tooltip content={<RetentionTooltip />} />
            <defs>
              <linearGradient id={'color'} x1="0" x2="0" y1="0" y2="1">
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
              label={{
                value: `Average (${round(averageRetentionRate, 2)} %)`,
                fill: getChartColor(1),
                position: 'insideBottomRight',
                fontSize: 12,
              }}
              stroke={getChartColor(1)}
              strokeDasharray="3 3"
              strokeLinecap="round"
              strokeOpacity={0.5}
              strokeWidth={2}
              y={averageRetentionRate}
            />
            <Area
              dataKey="percentage"
              fill={'url(#color)'}
              fillOpacity={0.1}
              isAnimationActive={false}
              stroke={getChartColor(0)}
              strokeWidth={2}
              type={'monotone'}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
