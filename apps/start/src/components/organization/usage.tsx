import {
  X_AXIS_STYLE_PROPS,
  useXAxisProps,
  useYAxisProps,
} from '@/components/report-chart/common/axis';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { formatDate } from '@/utils/date';
import { getChartColor } from '@/utils/theme';
import { sum } from '@openpanel/common';
import type { IServiceOrganization } from '@openpanel/db';
import { useQuery } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import { pick } from 'ramda';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip as RechartTooltip,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { BarShapeBlue } from '../charts/common-bar';

type Props = {
  organization: IServiceOrganization;
};

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="col gap-2 p-4 flex-1 min-w-0" title={`${title}: ${value}`}>
      <div className="text-muted-foreground truncate">{title}</div>
      <div className="font-mono text-xl font-bold truncate">{value}</div>
    </div>
  );
}

export default function Usage({ organization }: Props) {
  const number = useNumber();
  const trpc = useTRPC();
  const usageQuery = useQuery(
    trpc.subscription.usage.queryOptions({
      organizationId: organization.id,
    }),
  );

  // Determine interval based on data range - use weekly if more than 30 days
  const getDataInterval = () => {
    if (!usageQuery.data || usageQuery.data.length === 0) return 'day';

    const dates = usageQuery.data.map((item) => new Date(item.day));
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
    const daysDiff = Math.ceil(
      (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    return daysDiff > 30 ? 'week' : 'day';
  };

  const interval = getDataInterval();
  const useWeeklyIntervals = interval === 'week';
  const xAxisProps = useXAxisProps({ interval });
  const yAxisProps = useYAxisProps({});

  const wrapper = (node: React.ReactNode) => (
    <Widget className="w-full">
      <WidgetHead className="flex items-center justify-between">
        <span className="title">Usage</span>
      </WidgetHead>
      <WidgetBody>{node}</WidgetBody>
    </Widget>
  );

  if (usageQuery.isLoading) {
    return wrapper(
      <div className="center-center p-8">
        <Loader2Icon className="animate-spin" />
      </div>,
    );
  }
  if (usageQuery.isError) {
    return wrapper(
      <div className="center-center p-8 font-medium">
        Issues loading usage data
      </div>,
    );
  }

  const subscriptionPeriodEventsLimit = organization.hasSubscription
    ? organization.subscriptionPeriodEventsLimit
    : 0;
  const subscriptionPeriodEventsCount = organization.hasSubscription
    ? organization.subscriptionPeriodEventsCount
    : 0;

  // Group daily data into weekly intervals if data spans more than 30 days
  const processChartData = () => {
    if (!usageQuery.data) return [];

    if (useWeeklyIntervals) {
      // Group daily data into weekly intervals
      const weeklyData: {
        [key: string]: { count: number; startDate: Date; endDate: Date };
      } = {};

      usageQuery.data.forEach((item) => {
        const date = new Date(item.day);
        // Get the start of the week (Monday)
        const startOfWeek = new Date(date);
        const dayOfWeek = date.getDay();
        const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust when day is Sunday
        startOfWeek.setDate(diff);
        startOfWeek.setHours(0, 0, 0, 0);

        const weekKey = startOfWeek.toISOString().split('T')[0];

        if (!weeklyData[weekKey]) {
          weeklyData[weekKey] = {
            count: 0,
            startDate: new Date(startOfWeek),
            endDate: new Date(startOfWeek),
          };
        }

        weeklyData[weekKey].count += item.count;
        weeklyData[weekKey].endDate = new Date(date);
      });

      return Object.values(weeklyData).map((week) => ({
        date: week.startDate.getTime(),
        count: week.count,
        weekRange: `${formatDate(week.startDate)} - ${formatDate(week.endDate)}`,
      }));
    }

    // Use daily data for monthly subscriptions
    return usageQuery.data.map((item) => ({
      date: new Date(item.day).getTime(),
      count: item.count,
    }));
  };

  const chartData = processChartData();

  const domain = [
    0,
    Math.max(
      subscriptionPeriodEventsLimit,
      subscriptionPeriodEventsCount,
      ...chartData.map((item) => item.count),
    ),
  ] as [number, number];

  domain[1] += domain[1] * 0.05;

  return wrapper(
    <>
      <div className="border-b divide-x divide-border -m-4 mb-4 grid grid-cols-2 md:grid-cols-4">
        {organization.hasSubscription ? (
          <>
            <Card
              title="Period"
              value={
                organization.subscriptionCurrentPeriodStart &&
                organization.subscriptionCurrentPeriodEnd
                  ? `${formatDate(organization.subscriptionCurrentPeriodStart)}-${formatDate(organization.subscriptionCurrentPeriodEnd)}`
                  : '🤷‍♂️'
              }
            />
            <Card
              title="Limit"
              value={number.format(subscriptionPeriodEventsLimit)}
            />
            <Card
              title="Events count"
              value={number.format(subscriptionPeriodEventsCount)}
            />
            <Card
              title="Left to use"
              value={
                subscriptionPeriodEventsLimit === 0
                  ? '👀'
                  : number.formatWithUnit(
                      1 -
                        subscriptionPeriodEventsCount /
                          subscriptionPeriodEventsLimit,
                      '%',
                    )
              }
            />
          </>
        ) : (
          <>
            <div className="col-span-2">
              <Card title="Subscription" value={'No active subscription'} />
            </div>
            <div className="col-span-2">
              <Card
                title="Events from last 30 days"
                value={number.format(
                  sum(usageQuery.data?.map((item) => item.count) ?? []),
                )}
              />
            </div>
          </>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Events Chart */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            {useWeeklyIntervals ? 'Weekly Events' : 'Daily Events'}
          </h3>
          <div className="max-h-[300px] h-[250px] w-full p-4">
            <ResponsiveContainer>
              <BarChart data={chartData} barSize={useWeeklyIntervals ? 20 : 8}>
                <RechartTooltip
                  content={<EventsTooltip useWeekly={useWeeklyIntervals} />}
                />
                <Bar
                  dataKey="count"
                  isAnimationActive={false}
                  shape={BarShapeBlue}
                />
                <XAxis {...xAxisProps} dataKey="date" />
                <YAxis {...yAxisProps} domain={[0, 'dataMax']} />
                <CartesianGrid
                  horizontal={true}
                  vertical={false}
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Total Events vs Limit Chart */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Total Events vs Limit
          </h3>
          <div className="max-h-[300px] h-[250px] w-full p-4">
            <ResponsiveContainer>
              <BarChart
                data={[
                  {
                    name: 'Total Events',
                    count: subscriptionPeriodEventsCount,
                    limit: subscriptionPeriodEventsLimit,
                  },
                ]}
              >
                <RechartTooltip content={<TotalTooltip />} cursor={false} />
                {organization.hasSubscription &&
                  subscriptionPeriodEventsLimit > 0 && (
                    <ReferenceLine
                      y={subscriptionPeriodEventsLimit}
                      stroke={getChartColor(1)}
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      strokeOpacity={0.8}
                      strokeLinecap="round"
                      label={{
                        value: `Limit (${number.format(subscriptionPeriodEventsLimit)})`,
                        fill: getChartColor(1),
                        position: 'insideTopRight',
                        fontSize: 12,
                      }}
                    />
                  )}
                <Bar
                  dataKey="count"
                  isAnimationActive={false}
                  shape={BarShapeBlue}
                />
                <XAxis {...X_AXIS_STYLE_PROPS} dataKey="name" />
                <YAxis
                  {...yAxisProps}
                  domain={[
                    0,
                    Math.max(
                      subscriptionPeriodEventsLimit,
                      subscriptionPeriodEventsCount,
                    ) * 1.1,
                  ]}
                />
                <CartesianGrid
                  horizontal={true}
                  vertical={false}
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>,
  );
}

function EventsTooltip({ useWeekly, ...props }: { useWeekly: boolean } & any) {
  const number = useNumber();
  const payload = props.payload?.[0]?.payload;

  if (!payload) {
    return null;
  }

  return (
    <div className="flex min-w-[180px] flex-col gap-2 rounded-xl border bg-card p-3 shadow-xl">
      <div className="text-sm text-muted-foreground">
        {useWeekly && payload.weekRange
          ? payload.weekRange
          : payload?.date
            ? formatDate(new Date(payload.date))
            : 'Unknown date'}
      </div>
      <div className="flex items-center gap-2">
        <div className="h-10 w-1 rounded-full bg-chart-0" />
        <div className="col gap-1">
          <div className="text-sm text-muted-foreground">
            Events {useWeekly ? 'this week' : 'this day'}
          </div>
          <div className="text-lg font-semibold text-chart-0">
            {number.format(payload.count)}
          </div>
        </div>
      </div>
    </div>
  );
}

function TotalTooltip(props: any) {
  const number = useNumber();
  const payload = props.payload?.[0]?.payload;

  if (!payload) {
    return null;
  }

  return (
    <div className="flex min-w-[180px] flex-col gap-2 rounded-xl border bg-card p-3 shadow-xl">
      <div className="text-sm text-muted-foreground">Total Events</div>
      <div className="flex items-center gap-2">
        <div className="h-10 w-1 rounded-full bg-chart-2" />
        <div className="col gap-1">
          <div className="text-sm text-muted-foreground">Your events count</div>
          <div className="text-lg font-semibold text-chart-2">
            {number.format(payload.count)}
          </div>
        </div>
      </div>
      {payload.limit > 0 && (
        <div className="flex items-center gap-2">
          <div className="h-10 w-1 rounded-full border-2 border-dashed border-chart-1" />
          <div className="col gap-1">
            <div className="text-sm text-muted-foreground">Your tier limit</div>
            <div className="text-lg font-semibold text-chart-1">
              {number.format(payload.limit)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
