import type { IAiMetrics } from '@openpanel/core';
import { useQuery } from '@tanstack/react-query';
import { curveMonotoneX } from '@visx/curve';
import { RotateCwIcon } from 'lucide-react';
import { useState } from 'react';
import { formatCost, formatLatency, formatTokens } from './ai-format';
import { type AiMetricKey, metricReportDraft } from './ai-report-draft';
import { OpenAsReportLink } from './open-as-report-link';
import { Area } from '@/components/charts/area';
import { ComposedChart } from '@/components/charts/composed-chart';
import { Grid } from '@/components/charts/grid';
import { Line } from '@/components/charts/line';
import { OPChartTooltip } from '@/components/charts/op-tooltip';
import { XAxis } from '@/components/charts/x-axis';
import { YAxis } from '@/components/charts/y-axis';
import {
  type MetricUnit,
  OverviewMetricCard,
} from '@/components/overview/overview-metric-card';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { Skeleton } from '@/components/skeleton';
import { Button } from '@/components/ui/button';
import { useAiFilters } from '@/hooks/use-ai-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { getChartColor } from '@/utils/theme';

const PREV_LINE_COLOR = 'oklch(from var(--foreground) l c h / 0.4)';

interface MetricDefinition {
  key: AiMetricKey;
  title: string;
  unit: MetricUnit;
  inverted: boolean;
  format: (value: number) => string;
}

const METRICS: MetricDefinition[] = [
  {
    key: 'cost',
    title: 'Cost',
    unit: 'usd',
    inverted: true,
    format: formatCost,
  },
  {
    key: 'generations',
    title: 'Generations',
    unit: '',
    inverted: false,
    format: formatTokens,
  },
  {
    key: 'users',
    title: 'Users',
    unit: '',
    inverted: false,
    format: formatTokens,
  },
  {
    key: 'costPerUser',
    title: 'Cost per user',
    unit: 'usd',
    inverted: true,
    format: formatCost,
  },
  {
    key: 'inputTokens',
    title: 'Input tokens',
    unit: '',
    inverted: false,
    format: formatTokens,
  },
  {
    key: 'outputTokens',
    title: 'Output tokens',
    unit: '',
    inverted: false,
    format: formatTokens,
  },
  {
    key: 'p95LatencyMs',
    title: 'Latency p95',
    unit: 'ms',
    inverted: true,
    format: formatLatency,
  },
  {
    key: 'errorRate',
    title: 'Error rate',
    unit: '%',
    inverted: true,
    format: (value) => `${value.toFixed(1)}%`,
  },
];

interface ChartPoint extends Record<string, unknown> {
  date: string;
  current: number;
  previous?: number;
}

export function AiMetrics({ projectId }: { projectId: string }) {
  const trpc = useTRPC();
  const { range, interval, startDate, endDate, previous } =
    useOverviewOptions();
  const { filters } = useAiFilters();
  const [activeIndex, setActiveIndex] = useState(0);
  const active = METRICS[activeIndex] ?? METRICS[0]!;

  const query = useQuery(
    trpc.ai.overview.queryOptions({
      projectId,
      range,
      interval,
      startDate,
      endDate,
      previous,
      filters,
    })
  );

  const series = query.data?.series ?? [];
  const pointsFor = (key: keyof IAiMetrics): ChartPoint[] =>
    series.map((point) => ({
      date: point.date,
      current: point[key],
      previous: point.previous?.[key],
    }));
  const chartData = pointsFor(active.key);
  const color = getChartColor(0);

  return (
    <div className="col-span-6">
      <div className="card mb-2 grid grid-cols-2 overflow-hidden rounded-md md:grid-cols-4">
        {METRICS.map((metric, index) => (
          <OverviewMetricCard
            active={index === activeIndex}
            data={pointsFor(metric.key)}
            id={metric.key}
            interval={interval}
            inverted={metric.inverted}
            isError={query.isError}
            isLoading={query.isLoading}
            key={metric.key}
            label={metric.title}
            metric={{
              current: query.data?.metrics[metric.key] ?? 0,
              previous: query.data?.previousMetrics?.[metric.key] ?? null,
            }}
            onClick={() => setActiveIndex(index)}
            range={range}
            unit={metric.unit}
          />
        ))}
      </div>
      <div className="card p-4">
        <div className="row -mt-1 items-center justify-between">
          <div className="font-medium text-3xs text-muted-foreground uppercase tracking-wider">
            {active.title}
          </div>
          <OpenAsReportLink
            draft={metricReportDraft(
              { projectId, range, startDate, endDate, interval, filters },
              { metric: active.key, name: `AI ${active.title.toLowerCase()}` }
            )}
          />
        </div>
        <div className="h-[190px] w-full">
          {query.isLoading && <Skeleton className="h-full w-full" />}
          {query.isError && (
            <div className="center-center h-full flex-col gap-3 text-center text-muted-foreground text-sm">
              We could not load this data. Try again in a moment.
              <Button
                icon={RotateCwIcon}
                loading={query.isFetching}
                onClick={() => query.refetch()}
                size="sm"
                variant="outline"
              >
                Try again
              </Button>
            </div>
          )}
          {query.isSuccess && chartData.length > 0 && (
            <ComposedChart
              animationDuration={0}
              aspectRatio="auto"
              className="h-full"
              data={chartData}
              margin={{ top: 0, right: 20, bottom: 40, left: 20 }}
              xDataKey="date"
            >
              <Grid horizontal />
              <YAxis numTicks={4} />
              <XAxis />
              <Area
                animate={false}
                dataKey="current"
                fadeEdges="left"
                fill={color}
                fillOpacity={0.18}
                gradientToOpacity={0}
                key={active.key}
                stroke={color}
                strokeWidth={2}
              />
              {previous && (
                <Line
                  animate={false}
                  curve={curveMonotoneX}
                  dataKey="previous"
                  key={`prev-${active.key}`}
                  stroke={PREV_LINE_COLOR}
                  strokeWidth={2}
                />
              )}
              <OPChartTooltip<ChartPoint>
                indicatorColor={color}
                interval={interval}
                rows={(point) => [
                  {
                    color,
                    label: active.title,
                    value: point.current,
                    previous: point.previous,
                    format: active.format,
                  },
                ]}
              />
            </ComposedChart>
          )}
        </div>
      </div>
    </div>
  );
}
