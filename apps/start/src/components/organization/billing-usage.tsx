import type { IServiceOrganization } from '@openpanel/core';
import { sum } from '@openpanel/shared';
import { useQuery } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import { useCallback } from 'react';
import { ComposedChart } from '@/components/charts/composed-chart';
import { Grid } from '@/components/charts/grid';
import { OPChartTooltip } from '@/components/charts/op-tooltip';
import { SeriesBar } from '@/components/charts/series-bar';
import { XAxis } from '@/components/charts/x-axis';
import { YAxis } from '@/components/charts/y-axis';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { formatDateInterval } from '@/hooks/use-format-date-interval';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { formatDate } from '@/utils/date';
import { getChartColor } from '@/utils/theme';

const MARGIN = { top: 12, right: 12, bottom: 28, left: 40 };
const BAR_RADIUS = 4;
const DAILY_BAR_SIZE = 8;
const WEEKLY_BAR_SIZE = 20;
// Past this many days daily bars get too thin to read, so usage is summed per week.
const WEEKLY_THRESHOLD_DAYS = 30;
const BAR_COLOR = getChartColor(0);

interface Props {
  organization: IServiceOrganization;
}

interface UsagePoint {
  [key: string]: unknown;
  date: number;
  count: number;
  weekRange?: string;
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="col min-w-0 flex-1 gap-2 p-4" title={`${title}: ${value}`}>
      <div className="truncate text-muted-foreground">{title}</div>
      <div className="truncate font-bold font-mono text-xl">{value}</div>
    </div>
  );
}

export default function BillingUsage({ organization }: Props) {
  const number = useNumber();
  const trpc = useTRPC();
  const usageQuery = useQuery(
    trpc.subscription.usage.queryOptions({
      organizationId: organization.id,
    })
  );

  const getDataInterval = () => {
    if (!usageQuery.data || usageQuery.data.length === 0) {
      return 'day';
    }

    const dates = usageQuery.data.map((item) => new Date(item.day));
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
    const daysDiff = Math.ceil(
      (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    return daysDiff > WEEKLY_THRESHOLD_DAYS ? 'week' : 'day';
  };

  const interval = getDataInterval();
  const useWeeklyIntervals = interval === 'week';
  const formatDateLabel = useCallback(
    (date: Date) => formatDateInterval({ interval, date, short: true }),
    [interval]
  );

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
      </div>
    );
  }

  if (usageQuery.isError) {
    return wrapper(
      <div className="center-center p-8 font-medium">
        Issues loading usage data
      </div>
    );
  }

  if (
    usageQuery.data?.length === 0 ||
    !usageQuery.data?.some((item) => item.count !== 0)
  ) {
    return wrapper(
      <div className="center-center p-8 font-medium">No usage data yet</div>
    );
  }

  const subscriptionPeriodEventsLimit = organization.hasSubscription
    ? organization.subscriptionPeriodEventsLimit
    : 0;
  const subscriptionPeriodEventsCount = organization.hasSubscription
    ? organization.subscriptionPeriodEventsCount
    : 0;

  const processChartData = (): UsagePoint[] => {
    if (!usageQuery.data) {
      return [];
    }

    if (useWeeklyIntervals) {
      const weeklyData: {
        [key: string]: { count: number; startDate: Date; endDate: Date };
      } = {};

      for (const item of usageQuery.data) {
        const date = new Date(item.day);
        const startOfWeek = new Date(date);
        const dayOfWeek = date.getDay();
        // Weeks start on Monday; getDay() puts Sunday first.
        const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
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
      }

      return Object.values(weeklyData).map((week) => ({
        date: week.startDate.getTime(),
        count: week.count,
        weekRange: `${formatDate(week.startDate)} - ${formatDate(week.endDate)}`,
      }));
    }

    return usageQuery.data.map((item) => ({
      date: new Date(item.day).getTime(),
      count: item.count,
    }));
  };

  const chartData = processChartData();
  const eventsLabel = useWeeklyIntervals
    ? 'Events this week'
    : 'Events this day';

  return wrapper(
    <>
      <div className="-m-4 mb-4 grid grid-cols-2 border-b [&>div]:shadow-[0_0_0_0.5px] [&_div]:shadow-border">
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
              title="Left to use"
              value={
                subscriptionPeriodEventsLimit === 0
                  ? '👀'
                  : number.formatWithUnit(
                      1 -
                        subscriptionPeriodEventsCount /
                          subscriptionPeriodEventsLimit,
                      '%'
                    )
              }
            />
            <Card
              title="Events count"
              value={number.format(subscriptionPeriodEventsCount)}
            />
            <Card
              title="Limit"
              value={number.format(subscriptionPeriodEventsLimit)}
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
                  sum(usageQuery.data?.map((item) => item.count) ?? [])
                )}
              />
            </div>
          </>
        )}
      </div>
      <div className="space-y-2">
        <h3 className="font-medium text-muted-foreground text-sm">
          {useWeeklyIntervals ? 'Weekly Events' : 'Daily Events'}
        </h3>
        <ComposedChart
          animationDuration={0}
          aspectRatio="auto"
          className="h-[250px]"
          data={chartData}
          formatDateLabel={formatDateLabel}
          margin={MARGIN}
          maxBarSize={useWeeklyIntervals ? WEEKLY_BAR_SIZE : DAILY_BAR_SIZE}
          xDataKey="date"
        >
          <Grid horizontal />
          <YAxis formatValue={number.short} />
          <XAxis />
          <SeriesBar
            animate={false}
            dataKey="count"
            fill={BAR_COLOR}
            radius={BAR_RADIUS}
          />
          <OPChartTooltip<UsagePoint>
            interval={interval}
            rows={(point) => [
              {
                color: BAR_COLOR,
                label: eventsLabel,
                value: point.count,
                format: number.format,
              },
            ]}
            showCrosshair={false}
            showDots={false}
            title={(point) =>
              point.weekRange ?? formatDate(new Date(point.date))
            }
          />
        </ComposedChart>
      </div>
    </>
  );
}
