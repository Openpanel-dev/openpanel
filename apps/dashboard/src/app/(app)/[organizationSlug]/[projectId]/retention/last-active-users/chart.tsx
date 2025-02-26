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

type Props = {
  data: { users: number; days: number }[];
};

function Tooltip(props: any) {
  const payload = props.payload?.[0]?.payload;

  if (!payload) {
    return null;
  }
  return (
    <div className="flex min-w-[180px] flex-col gap-2 rounded-xl border bg-card p-3  shadow-xl">
      <div>
        <div className="text-sm text-muted-foreground">
          Days since last seen
        </div>
        <div className="text-lg font-semibold">{payload.days}</div>
      </div>
      <div>
        <div className="text-sm text-muted-foreground">Active users</div>
        <div className="text-lg font-semibold">{payload.users}</div>
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
            dataKey="users"
            stroke={getChartColor(0)}
            strokeWidth={2}
            fill={'url(#bg)'}
            isAnimationActive={false}
          />
          <XAxis
            {...xAxisProps}
            dataKey="days"
            scale="auto"
            type="category"
            label={{
              value: 'DAYS',
              position: 'insideBottom',
              offset: 0,
              fontSize: 10,
            }}
          />
          <YAxis
            {...yAxisProps}
            label={{
              value: 'USERS',
              angle: -90,
              position: 'insideLeft',
              offset: 0,
              fontSize: 10,
            }}
            dataKey="users"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default Chart;
