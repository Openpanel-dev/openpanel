'use client';

import {
  useXAxisProps,
  useYAxisProps,
} from '@/components/report-chart/common/axis';
import { getChartColor } from '@/utils/theme';
import {
  Area,
  AreaChart,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
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
    <div className="flex min-w-[180px] flex-col gap-2 rounded-xl border bg-card p-3  shadow-xl">
      <div className="text-sm text-muted-foreground">{payload.date}</div>
      <div>
        <div className="text-sm text-muted-foreground">
          Monthly active users
        </div>
        <div className="text-lg font-semibold text-chart-2">{payload.mau}</div>
      </div>
      <div>
        <div className="text-sm text-muted-foreground">Weekly active users</div>
        <div className="text-lg font-semibold text-chart-1">{payload.wau}</div>
      </div>
      <div>
        <div className="text-sm text-muted-foreground">Daily active users</div>
        <div className="text-lg font-semibold text-chart-0">{payload.dau}</div>
      </div>
    </div>
  );
}

const Chart = ({ data }: Props) => {
  const rechartData = data.daily.map((d) => ({
    date: new Date(d.date).getTime(),
    dau: d.users,
    wau: data.weekly.find((w) => w.date === d.date)?.users,
    mau: data.monthly.find((m) => m.date === d.date)?.users,
  }));
  const xAxisProps = useXAxisProps({ interval: 'day' });
  const yAxisProps = useYAxisProps();
  return (
    <div className="aspect-video max-h-[300px] w-full p-4">
      <ResponsiveContainer>
        <AreaChart data={rechartData}>
          <defs>
            <linearGradient id="dau" x1="0" y1="0" x2="0" y2="1">
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
            <linearGradient id="wau" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={getChartColor(1)}
                stopOpacity={0.8}
              />
              <stop
                offset="100%"
                stopColor={getChartColor(1)}
                stopOpacity={0.1}
              />
            </linearGradient>
            <linearGradient id="mau" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={getChartColor(2)}
                stopOpacity={0.8}
              />
              <stop
                offset="100%"
                stopColor={getChartColor(2)}
                stopOpacity={0.1}
              />
            </linearGradient>
          </defs>

          <RechartTooltip content={<Tooltip />} />

          <Area
            dataKey="dau"
            stroke={getChartColor(0)}
            strokeWidth={2}
            fill={'url(#dau)'}
            isAnimationActive={false}
          />
          <Area
            dataKey="wau"
            stroke={getChartColor(1)}
            strokeWidth={2}
            fill={'url(#wau)'}
            isAnimationActive={false}
          />
          <Area
            dataKey="mau"
            stroke={getChartColor(2)}
            strokeWidth={2}
            fill={'url(#mau)'}
            isAnimationActive={false}
          />
          <XAxis {...xAxisProps} dataKey="date" />
          <YAxis
            {...yAxisProps}
            label={{
              value: 'UNIQUE USERS',
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
