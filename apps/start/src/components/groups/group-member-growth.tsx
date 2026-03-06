import {
  useXAxisProps,
  useYAxisProps,
} from '@/components/report-chart/common/axis';
import { Widget, WidgetBody } from '@/components/widget';
import { WidgetHead, WidgetTitle } from '../overview/overview-widget';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useFormatDateInterval } from '@/hooks/use-format-date-interval';
import { TrendingUpIcon } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { getChartColor } from '@/utils/theme';

type Props = {
  data: { date: string; count: number }[];
};

function Tooltip(props: any) {
  const number = useNumber();
  const formatDate = useFormatDateInterval({ interval: 'day', short: false });
  const payload = props.payload?.[0]?.payload;

  if (!payload) {
    return null;
  }

  return (
    <div className="flex min-w-[160px] flex-col gap-2 rounded-xl border bg-card p-3 shadow-xl">
      <div className="text-muted-foreground text-sm">
        {formatDate(new Date(payload.timestamp))}
      </div>
      <div className="flex items-center gap-2">
        <div className="h-10 w-1 rounded-full" style={{ background: getChartColor(0) }} />
        <div className="col gap-1">
          <div className="text-muted-foreground text-sm">Total members</div>
          <div className="font-semibold text-lg" style={{ color: getChartColor(0) }}>
            {number.format(payload.cumulative)}
          </div>
        </div>
      </div>
      {payload.count > 0 && (
        <div className="text-muted-foreground text-xs">
          +{number.format(payload.count)} new
        </div>
      )}
    </div>
  );
}

export function GroupMemberGrowth({ data }: Props) {
  const xAxisProps = useXAxisProps({ interval: 'day' });
  const yAxisProps = useYAxisProps({});
  const color = getChartColor(0);

  let cumulative = 0;
  const chartData = data.map((item) => {
    cumulative += item.count;
    return {
      date: item.date,
      timestamp: new Date(item.date).getTime(),
      count: item.count,
      cumulative,
    };
  });

  const gradientId = 'memberGrowthGradient';

  return (
    <Widget className="w-full">
      <WidgetHead>
        <WidgetTitle icon={TrendingUpIcon}>Member growth</WidgetTitle>
      </WidgetHead>
      <WidgetBody>
        {data.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground text-sm">
            No data yet
          </p>
        ) : (
          <div className="h-[200px] w-full">
            <ResponsiveContainer>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <RechartTooltip
                  content={<Tooltip />}
                  cursor={{ stroke: color, strokeOpacity: 0.3 }}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  isAnimationActive={false}
                />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisProps} domain={[0, 'dataMax']} />
                <CartesianGrid
                  horizontal={true}
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                  vertical={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </WidgetBody>
    </Widget>
  );
}
