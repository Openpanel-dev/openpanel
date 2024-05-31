'use client';

import { getYAxisWidth } from '@/components/report/chart/chart-utils';
import { ResponsiveContainer } from '@/components/report/chart/ResponsiveContainer';
import { useFormatDateInterval } from '@/hooks/useFormatDateInterval';
import { useNumber } from '@/hooks/useNumerFormatter';
import { formatDate } from '@/utils/date';
import { getChartColor } from '@/utils/theme';
import {
  Area,
  AreaChart,
  Tooltip as RechartTooltip,
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
    <div className="flex min-w-[180px] flex-col gap-2 rounded-xl border bg-card p-3 text-sm shadow-xl">
      <div className="flex justify-between gap-8">
        <div>{formatDate(new Date(date))}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Active Users</div>
        <div className="text-lg font-semibold">{active_users}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Retained Users</div>
        <div className="text-lg font-semibold">{retained_users}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Retention</div>
        <div className="text-lg font-semibold">{round(retention, 2)}%</div>
      </div>
    </div>
  );
}

const Chart = ({ data }: Props) => {
  const max = Math.max(...data.map((d) => d.retention));
  const number = useNumber();
  return (
    <div className="p-4">
      <ResponsiveContainer>
        {({ width, height }) => (
          <AreaChart data={data} width={width} height={height}>
            <defs>
              <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={getChartColor(0)}
                  stopOpacity={0.8}
                ></stop>
                <stop
                  offset="100%"
                  stopColor={getChartColor(0)}
                  stopOpacity={0.1}
                ></stop>
              </linearGradient>
            </defs>

            <RechartTooltip content={<Tooltip />} />

            <Area
              dataKey="retention"
              stroke={getChartColor(0)}
              strokeWidth={2}
              fill={`url(#bg)`}
              isAnimationActive={false}
            />
            <XAxis
              axisLine={false}
              fontSize={12}
              dataKey="date"
              tickFormatter={(m: string) => formatDate(new Date(m))}
              tickLine={false}
              allowDuplicatedCategory={false}
              label={{
                value: 'DATE',
                position: 'insideBottom',
                offset: 0,
                fontSize: 10,
              }}
            />
            <YAxis
              label={{
                value: 'RETENTION (%)',
                angle: -90,
                position: 'insideLeft',
                offset: 0,
                fontSize: 10,
              }}
              fontSize={12}
              axisLine={false}
              tickLine={false}
              width={getYAxisWidth(max)}
              allowDecimals={false}
              domain={[0, max]}
              tickFormatter={number.short}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default Chart;
