import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { cn } from '@/utils/cn';

import { useDashedStroke } from '@/hooks/use-dashed-stroke';
import { useFormatDateInterval } from '@/hooks/use-format-date-interval';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';
import { getChartColor } from '@/utils/theme';
import { getPreviousMetric } from '@openpanel/common';
import type { IInterval } from '@openpanel/validation';
import { useQuery } from '@tanstack/react-query';
import { isSameDay, isSameHour, isSameMonth, isSameWeek } from 'date-fns';
import { last } from 'ramda';
import React, { useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Customized,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { createChartTooltip } from '../charts/chart-tooltip';
import { BarShapeGreen } from '../charts/common-bar';
import { useXAxisProps, useYAxisProps } from '../report-chart/common/axis';
import { PreviousDiffIndicatorPure } from '../report-chart/common/previous-diff-indicator';
import { Skeleton } from '../skeleton';
import { OverviewLiveHistogram } from './overview-live-histogram';
import { OverviewMetricCard } from './overview-metric-card';

interface OverviewMetricsProps {
  projectId: string;
}

const TITLES = [
  {
    title: 'Unique Visitors',
    key: 'unique_visitors',
    unit: '',
    inverted: false,
  },
  {
    title: 'Sessions',
    key: 'total_sessions',
    unit: '',
    inverted: false,
  },
  {
    title: 'Pageviews',
    key: 'total_screen_views',
    unit: '',
    inverted: false,
  },
  {
    title: 'Pages per session',
    key: 'views_per_session',
    unit: '',
    inverted: false,
  },
  {
    title: 'Bounce Rate',
    key: 'bounce_rate',
    unit: '%',
    inverted: true,
  },
  {
    title: 'Session Duration',
    key: 'avg_session_duration',
    unit: 'min',
    inverted: false,
  },
  {
    title: 'Revenue',
    key: 'total_revenue',
    unit: 'currency',
    inverted: false,
  },
] as const;

export default function OverviewMetrics({ projectId }: OverviewMetricsProps) {
  const { range, interval, metric, setMetric, startDate, endDate } =
    useOverviewOptions();
  const [filters] = useEventQueryFilters();
  const trpc = useTRPC();

  const activeMetric = TITLES[metric]!;
  const overviewQuery = useQuery(
    trpc.overview.stats.queryOptions({
      projectId,
      range,
      interval,
      filters,
      startDate,
      endDate,
    }),
  );

  const data =
    overviewQuery.data?.series?.map((item) => ({
      ...item,
      timestamp: new Date(item.date).getTime(),
    })) || [];

  console.log('data', data);

  return (
    <>
      <div className="relative -top-0.5 col-span-6 mb-0 mt-0 md:m-0">
        <div className="card mb-2 grid grid-cols-4 overflow-hidden rounded-md">
          {TITLES.map((title, index) => (
            <OverviewMetricCard
              key={title.key}
              id={title.key}
              onClick={() => setMetric(index)}
              label={title.title}
              metric={{
                current: overviewQuery.data?.metrics[title.key] ?? 0,
                previous: overviewQuery.data?.metrics[`prev_${title.key}`],
              }}
              unit={title.unit}
              data={data.map((item) => ({
                current: item[title.key],
                previous: item[`prev_${title.key}`],
              }))}
              active={metric === index}
              isLoading={overviewQuery.isLoading}
              inverted={title.inverted}
            />
          ))}

          <div
            className={cn(
              'col-span-4 min-h-16 flex-1 p-4 pb-0 shadow-[0_0_0_0.5px] shadow-border max-md:row-start-1 md:col-span-1',
            )}
          >
            <OverviewLiveHistogram projectId={projectId} />
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between mb-3 -mt-1">
            <div className="text-sm font-medium text-muted-foreground">
              {activeMetric.title}
            </div>
          </div>
          <div className="w-full h-[150px]">
            {overviewQuery.isLoading && <Skeleton className="h-full w-full" />}
            <Chart
              activeMetric={activeMetric}
              interval={interval}
              data={data}
              projectId={projectId}
            />
          </div>
        </div>
      </div>
    </>
  );
}

const { Tooltip, TooltipProvider } = createChartTooltip<
  RouterOutputs['overview']['stats']['series'][number],
  {
    metric: (typeof TITLES)[number];
    interval: IInterval;
  }
>(({ context: { metric, interval }, data: dataArray }) => {
  const data = dataArray[0];
  const formatDate = useFormatDateInterval(interval);
  const number = useNumber();

  if (!data) {
    return null;
  }

  const revenue = data.total_revenue ?? 0;
  const prevRevenue = data.prev_total_revenue ?? 0;

  return (
    <>
      <div className="flex justify-between gap-8 text-muted-foreground">
        <div>{formatDate(new Date(data.date))}</div>
      </div>
      <React.Fragment>
        <div className="flex gap-2">
          <div
            className="w-[3px] rounded-full"
            style={{ background: getChartColor(0) }}
          />
          <div className="col flex-1 gap-1">
            <div className="flex items-center gap-1">{metric.title}</div>
            <div className="flex justify-between gap-8 font-mono font-medium">
              <div className="row gap-1">
                {metric.unit === 'currency'
                  ? number.currency((data[metric.key] ?? 0) / 100)
                  : number.formatWithUnit(data[metric.key], metric.unit)}
                {!!data[`prev_${metric.key}`] && (
                  <span className="text-muted-foreground">
                    (
                    {metric.unit === 'currency'
                      ? number.currency((data[`prev_${metric.key}`] ?? 0) / 100)
                      : number.formatWithUnit(
                          data[`prev_${metric.key}`],
                          metric.unit,
                        )}
                    )
                  </span>
                )}
              </div>

              <PreviousDiffIndicatorPure
                {...getPreviousMetric(
                  data[metric.key],
                  data[`prev_${metric.key}`],
                )}
              />
            </div>
          </div>
        </div>
        {revenue > 0 && (
          <div className="flex gap-2 mt-2">
            <div
              className="w-[3px] rounded-full"
              style={{ background: '#3ba974' }}
            />
            <div className="col flex-1 gap-1">
              <div className="flex items-center gap-1">Revenue</div>
              <div className="flex justify-between gap-8 font-mono font-medium">
                <div className="row gap-1">
                  {number.currency(revenue / 100)}
                  {prevRevenue > 0 && (
                    <span className="text-muted-foreground">
                      ({number.currency(prevRevenue / 100)})
                    </span>
                  )}
                </div>
                {prevRevenue > 0 && (
                  <PreviousDiffIndicatorPure
                    {...getPreviousMetric(revenue, prevRevenue)}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </React.Fragment>
    </>
  );
});

function Chart({
  activeMetric,
  interval,
  data,
  projectId,
}: {
  activeMetric: (typeof TITLES)[number];
  interval: IInterval;
  data: RouterOutputs['overview']['stats']['series'];
  projectId: string;
}) {
  const xAxisProps = useXAxisProps({ interval });
  const yAxisProps = useYAxisProps();
  const number = useNumber();
  const revenueYAxisProps = useYAxisProps({
    tickFormatter: (value) => number.short(value / 100),
  });
  const [activeBar, setActiveBar] = useState(-1);
  const { range, startDate, endDate } = useOverviewOptions();

  const trpc = useTRPC();
  const references = useQuery(
    trpc.reference.getChartReferences.queryOptions(
      {
        projectId,
        startDate,
        endDate,
        range,
      },
      {
        staleTime: 1000 * 60 * 10,
      },
    ),
  );

  // Line chart specific logic
  let dotIndex = undefined;
  if (interval === 'hour') {
    // Find closest index based on times
    dotIndex = data.findIndex((item) => {
      return isSameHour(item.date, new Date());
    });
  }

  console.log('data', dotIndex);

  const { calcStrokeDasharray, handleAnimationEnd, getStrokeDasharray } =
    useDashedStroke({
      dotIndex,
    });

  const lastSerieDataItem = last(data)?.date || new Date();
  const useDashedLastLine = (() => {
    if (range === 'today') {
      return true;
    }

    if (interval === 'hour') {
      return isSameHour(lastSerieDataItem, new Date());
    }

    if (interval === 'day') {
      return isSameDay(lastSerieDataItem, new Date());
    }

    if (interval === 'month') {
      return isSameMonth(lastSerieDataItem, new Date());
    }

    if (interval === 'week') {
      return isSameWeek(lastSerieDataItem, new Date());
    }

    return false;
  })();

  return (
    <TooltipProvider metric={activeMetric} interval={interval}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          onMouseMove={(e) => {
            setActiveBar(e.activeTooltipIndex ?? -1);
          }}
        >
          <Customized component={calcStrokeDasharray} />
          <Line
            dataKey="calcStrokeDasharray"
            legendType="none"
            animationDuration={0}
            onAnimationEnd={handleAnimationEnd}
          />
          <Tooltip />
          <YAxis
            {...yAxisProps}
            domain={[0, activeMetric.key === 'bounce_rate' ? 100 : 'dataMax']}
            width={25}
          />
          <YAxis
            {...revenueYAxisProps}
            yAxisId="right"
            orientation="right"
            domain={[
              0,
              data.reduce(
                (max, item) => Math.max(max, item.total_revenue ?? 0),
                0,
              ) * 2,
            ]}
            width={25}
          />
          <XAxis {...xAxisProps} />

          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={true}
            vertical={false}
            className="stroke-border"
          />

          <defs>
            <filter
              id="rainbow-line-glow"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feComponentTransfer in="blur" result="dimmedBlur">
                <feFuncA type="linear" slope="0.5" />
              </feComponentTransfer>
              <feComposite
                in="SourceGraphic"
                in2="dimmedBlur"
                operator="over"
              />
            </filter>
          </defs>

          <Line
            key={`prev_${activeMetric.key}`}
            type="monotone"
            dataKey={`prev_${activeMetric.key}`}
            stroke={'oklch(from var(--foreground) l c h / 0.1)'}
            strokeWidth={2}
            isAnimationActive={false}
            dot={
              data.length > 90
                ? false
                : {
                    stroke: 'oklch(from var(--foreground) l c h / 0.1)',
                    fill: 'transparent',
                    strokeWidth: 1.5,
                    r: 2,
                  }
            }
            activeDot={{
              stroke: 'oklch(from var(--foreground) l c h / 0.2)',
              fill: 'transparent',
              strokeWidth: 1.5,
              r: 3,
            }}
          />
          <Bar
            key="total_revenue"
            dataKey="total_revenue"
            yAxisId="right"
            stackId="revenue"
            isAnimationActive={false}
            radius={5}
            maxBarSize={20}
          >
            {data.map((item, index) => {
              return (
                <Cell
                  key={item.date}
                  className={cn(
                    index === activeBar
                      ? 'fill-emerald-700/100'
                      : 'fill-emerald-700/80',
                  )}
                />
              );
            })}
          </Bar>
          <Area
            key={activeMetric.key}
            type="monotone"
            dataKey={activeMetric.key}
            stroke={getChartColor(0)}
            fill={getChartColor(0)}
            fillOpacity={0.05}
            strokeWidth={2}
            strokeDasharray={
              useDashedLastLine
                ? getStrokeDasharray(activeMetric.key)
                : undefined
            }
            isAnimationActive={false}
            dot={
              data.length > 90
                ? false
                : {
                    stroke: getChartColor(0),
                    fill: 'transparent',
                    strokeWidth: 1.5,
                    r: 3,
                  }
            }
            activeDot={{
              stroke: getChartColor(0),
              fill: 'var(--def-100)',
              strokeWidth: 2,
              r: 4,
            }}
            filter="url(#rainbow-line-glow)"
          />

          {references.data?.map((ref) => (
            <ReferenceLine
              key={ref.id}
              x={ref.date.getTime()}
              stroke={'oklch(from var(--foreground) l c h / 0.1)'}
              strokeDasharray={'3 3'}
              label={{
                value: ref.title,
                position: 'centerTop',
                fill: '#334155',
                fontSize: 12,
              }}
              fontSize={10}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </TooltipProvider>
  );
}
