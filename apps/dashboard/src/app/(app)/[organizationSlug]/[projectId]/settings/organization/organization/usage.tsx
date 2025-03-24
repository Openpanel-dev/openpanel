'use client';

import {
  useXAxisProps,
  useYAxisProps,
} from '@/components/report-chart/common/axis';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { useNumber } from '@/hooks/useNumerFormatter';
import { api } from '@/trpc/client';
import { formatDate } from '@/utils/date';
import { getChartColor } from '@/utils/theme';
import { sum } from '@openpanel/common';
import type { IServiceOrganization } from '@openpanel/db';
import { Loader2Icon } from 'lucide-react';
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
  const xAxisProps = useXAxisProps({ interval: 'day' });
  const yAxisProps = useYAxisProps({});
  const usageQuery = api.subscription.usage.useQuery({
    organizationId: organization.id,
  });

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

  const domain = [
    0,
    Math.max(
      subscriptionPeriodEventsLimit,
      subscriptionPeriodEventsCount,
      ...usageQuery.data.map((item) => item.count),
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
                  sum(usageQuery.data.map((item) => item.count)),
                )}
              />
            </div>
          </>
        )}
      </div>
      <div className="aspect-video max-h-[300px] w-full p-4">
        <ResponsiveContainer>
          <BarChart
            data={usageQuery.data.map((item) => ({
              date: new Date(item.day).getTime(),
              count: item.count,
              limit: subscriptionPeriodEventsLimit,
              total: subscriptionPeriodEventsCount,
            }))}
            barSize={8}
          >
            <defs>
              <linearGradient id="usage" x1="0" y1="0" x2="0" y2="1">
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
            <RechartTooltip
              content={<Tooltip />}
              cursor={{
                stroke: 'hsl(var(--def-400))',
                fill: 'hsl(var(--def-200))',
              }}
            />
            {organization.hasSubscription && (
              <>
                <ReferenceLine
                  y={subscriptionPeriodEventsLimit}
                  stroke={getChartColor(1)}
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                  strokeLinecap="round"
                  label={{
                    value: `Limit (${number.format(subscriptionPeriodEventsLimit)})`,
                    fill: getChartColor(1),
                    position: 'insideTopRight',
                    fontSize: 12,
                  }}
                />
                <ReferenceLine
                  y={subscriptionPeriodEventsCount}
                  stroke={getChartColor(2)}
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                  strokeLinecap="round"
                  label={{
                    value: `Your events count (${number.format(subscriptionPeriodEventsCount)})`,
                    fill: getChartColor(2),
                    position:
                      subscriptionPeriodEventsCount > 1000
                        ? 'insideTop'
                        : 'insideBottom',
                    fontSize: 12,
                  }}
                />
              </>
            )}
            <Bar
              dataKey="count"
              stroke={getChartColor(0)}
              strokeWidth={0.5}
              fill={'url(#usage)'}
              isAnimationActive={false}
            />
            <XAxis {...xAxisProps} dataKey="date" />
            <YAxis
              {...yAxisProps}
              domain={domain}
              interval={0}
              ticks={[
                0,
                subscriptionPeriodEventsLimit * 0.25,
                subscriptionPeriodEventsLimit * 0.5,
                subscriptionPeriodEventsLimit * 0.75,
                subscriptionPeriodEventsLimit,
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
    </>,
  );
}

function Tooltip(props: any) {
  const number = useNumber();
  const payload = props.payload?.[0]?.payload;

  if (!payload) {
    return null;
  }
  return (
    <div className="flex min-w-[180px] flex-col gap-2 rounded-xl border bg-card p-3  shadow-xl">
      <div className="text-sm text-muted-foreground">
        {formatDate(payload.date)}
      </div>
      {payload.limit !== 0 && (
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
      {payload.total !== 0 && (
        <div className="flex items-center gap-2">
          <div className="h-10 w-1 rounded-full border-2 border-dashed border-chart-2" />
          <div className="col gap-1">
            <div className="text-sm text-muted-foreground">
              Total events count
            </div>
            <div className="text-lg font-semibold text-chart-2">
              {number.format(payload.total)}
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="h-10 w-1 rounded-full bg-chart-0" />
        <div className="col gap-1">
          <div className="text-sm text-muted-foreground">Events this day</div>
          <div className="text-lg font-semibold text-chart-0">
            {number.format(payload.count)}
          </div>
        </div>
      </div>
    </div>
  );
}
