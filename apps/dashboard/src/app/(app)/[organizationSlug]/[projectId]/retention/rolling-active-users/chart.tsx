'use client';

import { getYAxisWidth } from '@/components/report/chart/chart-utils';
import { ResponsiveContainer } from '@/components/report/chart/ResponsiveContainer';
import { useNumber } from '@/hooks/useNumerFormatter';
import { getChartColor } from '@/utils/theme';
import {
  Area,
  AreaChart,
  Tooltip as RechartTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { IServiceRetentionRollingActiveUsers } from '@openpanel/db';

type Props = {
  data: {
    daily: IServiceRetentionRollingActiveUsers[];
    weekly: IServiceRetentionRollingActiveUsers[];
    monthly: IServiceRetentionRollingActiveUsers[];
  };
};

function Tooltip(props: any) {
  const payload = props.payload?.[2]?.payload;

  if (!payload) {
    return null;
  }
  return (
    <div className="flex min-w-[180px] flex-col gap-2 rounded-xl border bg-background p-3 text-sm shadow-xl">
      <div className="text-xs text-muted-foreground">{payload.date}</div>
      <div>
        <div className="text-xs text-muted-foreground">
          Monthly active users
        </div>
        <div className="text-lg font-semibold text-chart-2">{payload.mau}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Weekly active users</div>
        <div className="text-lg font-semibold text-chart-1">{payload.wau}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Daily active users</div>
        <div className="text-lg font-semibold text-chart-0">{payload.dau}</div>
      </div>
    </div>
  );
}

const Chart = ({ data }: Props) => {
  const max = Math.max(...data.monthly.map((d) => d.users));
  const number = useNumber();
  const rechartData = data.daily.map((d) => ({
    date: d.date,
    dau: d.users,
    wau: data.weekly.find((w) => w.date === d.date)?.users,
    mau: data.monthly.find((m) => m.date === d.date)?.users,
  }));
  return (
    <div className="p-4">
      <ResponsiveContainer>
        {({ width, height }) => (
          <AreaChart data={rechartData} width={width} height={height}>
            <defs>
              <linearGradient id="dau" x1="0" y1="0" x2="0" y2="1">
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
              <linearGradient id="wau" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={getChartColor(1)}
                  stopOpacity={0.8}
                ></stop>
                <stop
                  offset="100%"
                  stopColor={getChartColor(1)}
                  stopOpacity={0.1}
                ></stop>
              </linearGradient>
              <linearGradient id="mau" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={getChartColor(2)}
                  stopOpacity={0.8}
                ></stop>
                <stop
                  offset="100%"
                  stopColor={getChartColor(2)}
                  stopOpacity={0.1}
                ></stop>
              </linearGradient>
            </defs>

            <RechartTooltip content={<Tooltip />} />

            <Area
              dataKey="dau"
              stroke={getChartColor(0)}
              strokeWidth={2}
              fill={`url(#dau)`}
              isAnimationActive={false}
            />
            <Area
              dataKey="wau"
              stroke={getChartColor(1)}
              strokeWidth={2}
              fill={`url(#wau)`}
              isAnimationActive={false}
            />
            <Area
              dataKey="mau"
              stroke={getChartColor(2)}
              strokeWidth={2}
              fill={`url(#mau)`}
              isAnimationActive={false}
            />
            <XAxis
              dataKey="date"
              axisLine={false}
              fontSize={12}
              // type="number"
              tickLine={false}
            />
            <YAxis
              label={{
                value: 'UNIQUE USERS',
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
