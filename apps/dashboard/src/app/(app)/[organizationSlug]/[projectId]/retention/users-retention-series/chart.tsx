'use client';

import {
  useXAxisProps,
  useYAxisProps,
} from '@/components/report-chart/common/axis';
import { useFormatDateInterval } from '@/hooks/useFormatDateInterval';
import { formatDate } from '@/utils/date';
import { getChartColor } from '@/utils/theme';
import {
  Area,
  AreaChart,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

import { round } from '@openpanel/common';

type Props = {
  data: {
    date: string;
    active_users: number;
    retained_users: number;
    retention: number;
  }[];
};

function Tooltip({ payload }: any) {
  const { date, active_users, retained_users, retention } =
    payload?.[0]?.payload || {};
  const formatDate = useFormatDateInterval('day');
  if (!date) {
    return null;
  }
  return (
    <div className="flex min-w-[180px] flex-col gap-2 rounded-xl border bg-card p-3  shadow-xl">
      <div className="flex justify-between gap-8">
        <div>{formatDate(new Date(date))}</div>
      </div>
      <div>
        <div className="text-sm text-muted-foreground">Active Users</div>
        <div className="text-lg font-semibold">{active_users}</div>
      </div>
      <div>
        <div className="text-sm text-muted-foreground">Retained Users</div>
        <div className="text-lg font-semibold">{retained_users}</div>
      </div>
      <div>
        <div className="text-sm text-muted-foreground">Retention</div>
        <div className="text-lg font-semibold">{round(retention, 2)}%</div>
      </div>
    </div>
  );
}

const Chart = ({ data }: Props) => {
  const xAxisProps = useXAxisProps();
  const yAxisProps = useYAxisProps();
  return (
    <div className="aspect-video max-h-[300px] w-full p-4">
      <ResponsiveContainer>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
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

          <RechartTooltip content={<Tooltip />} />

          <Area
            dataKey="retention"
            stroke={getChartColor(0)}
            strokeWidth={2}
            fill={'url(#bg)'}
            isAnimationActive={false}
          />
          <XAxis
            {...xAxisProps}
            dataKey="date"
            tickFormatter={(m: string) => formatDate(new Date(m))}
            allowDuplicatedCategory={false}
            label={{
              value: 'DATE',
              position: 'insideBottom',
              offset: 0,
              fontSize: 10,
            }}
          />
          <YAxis
            {...yAxisProps}
            label={{
              value: 'RETENTION (%)',
              angle: -90,
              position: 'insideLeft',
              offset: 0,
              fontSize: 10,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default Chart;
