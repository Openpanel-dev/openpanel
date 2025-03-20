'use client';

import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';

import { useFormatDateInterval } from '@/hooks/useFormatDateInterval';
import { useNumber } from '@/hooks/useNumerFormatter';
import { type RouterOutputs, api } from '@/trpc/client';
import { getChartColor } from '@/utils/theme';
import { getPreviousMetric } from '@openpanel/common';
import React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { createChartTooltip } from '../charts/chart-tooltip';
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
] as const;

export default function OverviewMetricsV2({ projectId }: OverviewMetricsProps) {
  const { range, interval, metric, setMetric, startDate, endDate } =
    useOverviewOptions();
  const [filters] = useEventQueryFilters();

  const activeMetric = TITLES[metric]!;
  const overviewQuery = api.overview.stats.useQuery({
    projectId,
    range,
    interval,
    filters,
    startDate,
    endDate,
  });

  const data =
    overviewQuery.data?.series?.map((item) => ({
      ...item,
      timestamp: new Date(item.date).getTime(),
    })) || [];

  const xAxisProps = useXAxisProps({ interval: 'day' });
  const yAxisProps = useYAxisProps();

  return (
    <>
      <div className="relative -top-0.5 col-span-6 -m-4 mb-0 mt-0 md:m-0">
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
            />
          ))}

          <div
            className={cn(
              'col-span-4 min-h-16 flex-1 p-4 pb-0 shadow-[0_0_0_0.5px] shadow-border max-md:row-start-1 md:col-span-2',
            )}
          >
            <OverviewLiveHistogram projectId={projectId} />
          </div>
        </div>

        <div className="card p-4">
          <div className="text-center text-muted-foreground mb-2">
            {activeMetric.title}
          </div>
          <div className="w-full h-[150px]">
            {overviewQuery.isLoading && <Skeleton className="h-full w-full" />}
            <TooltipProvider metric={activeMetric}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <Tooltip />
                  <YAxis
                    {...yAxisProps}
                    domain={[
                      0,
                      activeMetric.key === 'bounce_rate' ? 100 : 'dataMax',
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

                  <Line
                    key={`prev_${activeMetric.key}`}
                    type="linear"
                    dataKey={`prev_${activeMetric.key}`}
                    stroke={'hsl(var(--foreground) / 0.2)'}
                    strokeWidth={2}
                    isAnimationActive={false}
                    dot={
                      data.length > 90
                        ? false
                        : {
                            stroke: 'hsl(var(--foreground) / 0.2)',
                            fill: 'hsl(var(--def-100))',
                            strokeWidth: 1.5,
                            r: 3,
                          }
                    }
                    activeDot={{
                      stroke: 'hsl(var(--foreground) / 0.2)',
                      fill: 'hsl(var(--def-100))',
                      strokeWidth: 2,
                      r: 4,
                    }}
                  />

                  <Line
                    key={activeMetric.key}
                    type="linear"
                    dataKey={activeMetric.key}
                    stroke={getChartColor(0)}
                    strokeWidth={2}
                    isAnimationActive={false}
                    dot={
                      data.length > 90
                        ? false
                        : {
                            stroke: getChartColor(0),
                            fill: 'hsl(var(--def-100))',
                            strokeWidth: 1.5,
                            r: 3,
                          }
                    }
                    activeDot={{
                      stroke: getChartColor(0),
                      fill: 'hsl(var(--def-100))',
                      strokeWidth: 2,
                      r: 4,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </TooltipProvider>
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
  }
>(({ context: { metric }, data }) => {
  const formatDate = useFormatDateInterval('day');
  const number = useNumber();

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
                {number.formatWithUnit(data[metric.key])}
                {!!data[`prev_${metric.key}`] && (
                  <span className="text-muted-foreground">
                    ({number.formatWithUnit(data[`prev_${metric.key}`])})
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
      </React.Fragment>
    </>
  );
});
