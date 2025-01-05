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
import type { IServiceOrganization } from '@openpanel/db';
import { Loader2Icon } from 'lucide-react';
import {
  Area,
  AreaChart,
  Tooltip as RechartTooltip,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

type Props = {
  organization: IServiceOrganization;
};

export default function Usage({ organization }: Props) {
  const number = useNumber();
  const xAxisProps = useXAxisProps({ interval: 'day' });
  const yAxisProps = useYAxisProps({});
  const usageQuery = api.subscription.usage.useQuery({
    organizationId: organization.id,
  });

  function render() {
    if (usageQuery.isLoading) {
      return (
        <div className="center-center p-8">
          <Loader2Icon className="animate-spin" />
        </div>
      );
    }
    if (usageQuery.isError) {
      return (
        <div className="center-center p-8 font-medium">
          Issues loading usage data
        </div>
      );
    }

    const domain = [
      0,
      Math.max(
        organization.subscriptionPeriodLimit,
        ...usageQuery.data.map((item) => item.count),
      ),
    ];

    return (
      <div className="aspect-video max-h-[300px] w-full p-4">
        <ResponsiveContainer>
          <AreaChart
            data={usageQuery.data.map((item) => ({
              date: new Date(item.day).getTime(),
              count: item.count,
              limit: organization.subscriptionPeriodLimit,
            }))}
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
              }}
            />
            <ReferenceLine
              y={organization.subscriptionPeriodLimit}
              stroke={getChartColor(1)}
              strokeWidth={2}
              strokeDasharray="3 3"
              strokeOpacity={0.5}
              strokeLinecap="round"
              label={{
                value: `Limit (${number.format(organization.subscriptionPeriodLimit)})`,
                fill: getChartColor(1),
                position: 'insideTopRight',
                fontSize: 12,
              }}
            />
            <Area
              dataKey="count"
              stroke={getChartColor(0)}
              strokeWidth={2}
              fill={'url(#usage)'}
              isAnimationActive={false}
            />
            <XAxis {...xAxisProps} dataKey="date" />
            <YAxis {...yAxisProps} domain={domain} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <>
      <Widget className="w-full">
        <WidgetHead className="flex items-center justify-between">
          <span className="title">Usage</span>
        </WidgetHead>
        <WidgetBody>{render()}</WidgetBody>
      </Widget>
    </>
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
      <div className="flex items-center gap-2">
        <div className="h-10 w-1 rounded-full bg-chart-1" />
        <div className="col gap-1">
          <div className="text-sm text-muted-foreground">Your tier limit</div>
          <div className="text-lg font-semibold text-chart-1">
            {number.format(payload.limit)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-10 w-1 rounded-full bg-chart-0" />
        <div className="col gap-1">
          <div className="text-sm text-muted-foreground">Events count</div>
          <div className="text-lg font-semibold text-chart-0">
            {number.format(payload.count)}
          </div>
        </div>
      </div>
    </div>
  );
}
