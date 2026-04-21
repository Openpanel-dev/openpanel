import { ActivityIcon } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import {
  useXAxisProps,
  useYAxisProps,
} from '@/components/report-chart/common/axis';
import { Widget, WidgetBody } from '@/components/widget';
import { useFormatDateInterval } from '@/hooks/use-format-date-interval';
import { useNumber } from '@/hooks/use-numer-formatter';
import { getChartColor } from '@/utils/theme';
import { WidgetHead, WidgetTitle } from '../overview/overview-widget';

type Props = {
  data: { date: string; count: number }[];
};

function Tooltip(props: any) {
  const number = useNumber();
  const formatDate = useFormatDateInterval({ interval: 'day', short: false });
  const payload = props.payload?.[0]?.payload;

  if (!payload) return null;

  return (
    <div className="flex min-w-[160px] flex-col gap-2 rounded-xl border bg-card p-3 shadow-xl">
      <div className="text-muted-foreground text-sm">
        {formatDate(new Date(payload.timestamp))}
      </div>
      <div className="flex items-center gap-2">
        <div
          className="h-10 w-1 rounded-full"
          style={{ background: getChartColor(0) }}
        />
        <div className="col gap-1">
          <div className="text-muted-foreground text-sm">Events</div>
          <div
            className="font-semibold text-lg"
            style={{ color: getChartColor(0) }}
          >
            {number.format(payload.count)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CohortEventsChart({ data }: Props) {
  const xAxisProps = useXAxisProps({ interval: 'day' });
  const yAxisProps = useYAxisProps({});
  const color = getChartColor(0);

  const chartData = data.map((item) => ({
    date: item.date,
    timestamp: new Date(item.date).getTime(),
    count: item.count,
  }));

  const gradientId = 'cohortEventsGradient';
  const total = data.reduce((acc, d) => acc + d.count, 0);

  return (
    <Widget className="w-full">
      <WidgetHead>
        <WidgetTitle icon={ActivityIcon}>
          Events last 30 days ({total.toLocaleString()})
        </WidgetTitle>
      </WidgetHead>
      <WidgetBody>
        {total === 0 ? (
          <p className="py-4 text-center text-muted-foreground text-sm">
            No events yet
          </p>
        ) : (
          <div className="h-[200px] w-full">
            <ResponsiveContainer>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <RechartTooltip
                  content={<Tooltip />}
                  cursor={{ stroke: color, strokeOpacity: 0.3 }}
                />
                <Area
                  dataKey="count"
                  dot={false}
                  fill={`url(#${gradientId})`}
                  isAnimationActive={false}
                  stroke={color}
                  strokeWidth={2}
                  type="monotone"
                />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisProps} />
                <CartesianGrid
                  className="stroke-border"
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
