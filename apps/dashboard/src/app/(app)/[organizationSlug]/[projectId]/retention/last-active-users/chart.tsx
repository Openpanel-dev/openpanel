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

type Props = {
  data: { users: number; days: number }[];
};

function Tooltip(props: any) {
  const payload = props.payload?.[0]?.payload;

  if (!payload) {
    return null;
  }
  return (
    <div className="flex min-w-[180px] flex-col gap-2 rounded-xl border bg-background p-3 text-sm shadow-xl">
      <div>
        <div className="text-xs text-muted-foreground">
          Days since last seen
        </div>
        <div className="text-lg font-semibold">{payload.days}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Active users</div>
        <div className="text-lg font-semibold">{payload.users}</div>
      </div>
    </div>
  );
}

const Chart = ({ data }: Props) => {
  const max = Math.max(...data.map((d) => d.users));
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
              dataKey="users"
              stroke={getChartColor(0)}
              strokeWidth={2}
              fill={`url(#bg)`}
            />
            <XAxis
              dataKey="days"
              axisLine={false}
              fontSize={12}
              // type="number"
              tickLine={false}
              label={{
                value: 'DAYS',
                position: 'insideBottom',
                offset: 0,
                fontSize: 10,
              }}
            />
            <YAxis
              label={{
                value: 'USERS',
                angle: -90,
                position: 'insideLeft',
                offset: 0,
                fontSize: 10,
              }}
              dataKey="users"
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
