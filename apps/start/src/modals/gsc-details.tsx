import type { IChartRange, IInterval } from '@openpanel/validation';
import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartTooltipHeader,
  ChartTooltipItem,
  createChartTooltip,
} from '@/components/charts/chart-tooltip';
import { OverviewWidgetTable } from '@/components/overview/overview-widget-table';
import {
  useYAxisProps,
  X_AXIS_STYLE_PROPS,
} from '@/components/report-chart/common/axis';
import { Skeleton } from '@/components/skeleton';
import { SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useTRPC } from '@/integrations/trpc/react';
import { getChartColor } from '@/utils/theme';

type GscChartData = { date: string; clicks: number; impressions: number };

const { TooltipProvider, Tooltip: GscTooltip } = createChartTooltip<
  GscChartData,
  Record<string, unknown>
>(({ data }) => {
  const item = data[0];
  if (!item) {
    return null;
  }
  return (
    <>
      <ChartTooltipHeader>
        <div>{item.date}</div>
      </ChartTooltipHeader>
      <ChartTooltipItem color={getChartColor(0)}>
        <div className="flex justify-between gap-8 font-medium font-mono">
          <span>Clicks</span>
          <span>{item.clicks.toLocaleString()}</span>
        </div>
      </ChartTooltipItem>
      <ChartTooltipItem color={getChartColor(1)}>
        <div className="flex justify-between gap-8 font-medium font-mono">
          <span>Impressions</span>
          <span>{item.impressions.toLocaleString()}</span>
        </div>
      </ChartTooltipItem>
    </>
  );
});

type Props =
  | {
      type: 'page';
      projectId: string;
      value: string;
      range: IChartRange;
      interval: IInterval;
    }
  | {
      type: 'query';
      projectId: string;
      value: string;
      range: IChartRange;
      interval: IInterval;
    };

export default function GscDetails(props: Props) {
  const { type, projectId, value, range, interval } = props;
  const trpc = useTRPC();

  const dateInput = {
    range,
    interval,
  };

  const pageQuery = useQuery(
    trpc.gsc.getPageDetails.queryOptions(
      { projectId, page: value, ...dateInput },
      { enabled: type === 'page' }
    )
  );

  const queryQuery = useQuery(
    trpc.gsc.getQueryDetails.queryOptions(
      { projectId, query: value, ...dateInput },
      { enabled: type === 'query' }
    )
  );

  const pagesTimeseriesQuery = useQuery(
    trpc.event.pagesTimeseries.queryOptions(
      { projectId, ...dateInput },
      { enabled: type === 'page' }
    )
  );

  const data = type === 'page' ? pageQuery.data : queryQuery.data;
  const isLoading =
    type === 'page' ? pageQuery.isLoading : queryQuery.isLoading;

  const timeseries = data?.timeseries ?? [];
  const pagesTimeseries = pagesTimeseriesQuery.data ?? [];
  const breakdownRows =
    type === 'page'
      ? ((data as { queries?: unknown[] } | undefined)?.queries ?? [])
      : ((data as { pages?: unknown[] } | undefined)?.pages ?? []);

  const breakdownKey = type === 'page' ? 'query' : 'page';
  const breakdownLabel = type === 'page' ? 'Query' : 'Page';

  const maxClicks = Math.max(
    ...(breakdownRows as { clicks: number }[]).map((r) => r.clicks),
    1
  );

  return (
    <SheetContent className="flex flex-col gap-6 overflow-y-auto sm:max-w-xl">
      <SheetHeader>
        <SheetTitle className="truncate pr-8 font-medium font-mono text-sm">
          {value}
        </SheetTitle>
      </SheetHeader>

      <div className="col gap-6">
        {type === 'page' && (
          <div className="card p-4">
            <h3 className="mb-4 font-medium text-sm">Views & Sessions</h3>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <GscViewsChart
                data={pagesTimeseries
                  .filter((r) => r.origin + r.path === value)
                  .map((r) => ({ date: r.date, views: r.pageviews }))}
              />
            )}
          </div>
        )}

        <div className="card p-4">
          <h3 className="mb-4 font-medium text-sm">Clicks & Impressions</h3>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <GscTimeseriesChart data={timeseries} />
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="border-b p-4">
            <h3 className="font-medium text-sm">
              Top {breakdownLabel.toLowerCase()}s
            </h3>
          </div>
          {isLoading ? (
            <OverviewWidgetTable
              columns={[
                {
                  name: breakdownLabel,
                  width: 'w-full',
                  render: () => <Skeleton className="h-4 w-2/3" />,
                },
                {
                  name: 'Clicks',
                  width: '70px',
                  render: () => <Skeleton className="h-4 w-10" />,
                },
                {
                  name: 'Pos.',
                  width: '55px',
                  render: () => <Skeleton className="h-4 w-8" />,
                },
              ]}
              data={[1, 2, 3, 4, 5]}
              getColumnPercentage={() => 0}
              keyExtractor={(i) => String(i)}
            />
          ) : (
            <OverviewWidgetTable
              columns={[
                {
                  name: breakdownLabel,
                  width: 'w-full',
                  render(item) {
                    return (
                      <div className="min-w-0 overflow-hidden">
                        <span className="block truncate font-mono text-xs">
                          {String(item[breakdownKey])}
                        </span>
                      </div>
                    );
                  },
                },
                {
                  name: 'Clicks',
                  width: '70px',
                  getSortValue: (item) => item.clicks as number,
                  render(item) {
                    return (
                      <span className="font-mono font-semibold text-xs">
                        {(item.clicks as number).toLocaleString()}
                      </span>
                    );
                  },
                },
                {
                  name: 'Impr.',
                  width: '70px',
                  getSortValue: (item) => item.impressions as number,
                  render(item) {
                    return (
                      <span className="font-mono font-semibold text-xs">
                        {(item.impressions as number).toLocaleString()}
                      </span>
                    );
                  },
                },
                {
                  name: 'CTR',
                  width: '60px',
                  getSortValue: (item) => item.ctr as number,
                  render(item) {
                    return (
                      <span className="font-mono font-semibold text-xs">
                        {((item.ctr as number) * 100).toFixed(1)}%
                      </span>
                    );
                  },
                },
                {
                  name: 'Pos.',
                  width: '55px',
                  getSortValue: (item) => item.position as number,
                  render(item) {
                    return (
                      <span className="font-mono font-semibold text-xs">
                        {(item.position as number).toFixed(1)}
                      </span>
                    );
                  },
                },
              ]}
              data={breakdownRows as Record<string, string | number>[]}
              getColumnPercentage={(item) =>
                (item.clicks as number) / maxClicks
              }
              keyExtractor={(item) => String(item[breakdownKey])}
            />
          )}
        </div>
      </div>
    </SheetContent>
  );
}

function GscViewsChart({
  data,
}: {
  data: Array<{ date: string; views: number }>;
}) {
  const yAxisProps = useYAxisProps();

  return (
    <TooltipProvider>
      <ResponsiveContainer height={160} width="100%">
        <ComposedChart data={data}>
          <defs>
            <filter
              height="140%"
              id="gsc-detail-glow"
              width="140%"
              x="-20%"
              y="-20%"
            >
              <feGaussianBlur result="blur" stdDeviation="5" />
              <feComponentTransfer in="blur" result="dimmedBlur">
                <feFuncA slope="0.5" type="linear" />
              </feComponentTransfer>
              <feComposite
                in="SourceGraphic"
                in2="dimmedBlur"
                operator="over"
              />
            </filter>
          </defs>
          <CartesianGrid
            className="stroke-border"
            horizontal
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            {...X_AXIS_STYLE_PROPS}
            dataKey="date"
            tickFormatter={(v: string) => v.slice(5)}
            type="category"
          />
          <YAxis {...yAxisProps} yAxisId="left" />
          <YAxis {...yAxisProps} orientation="right" yAxisId="right" />
          <GscTooltip />
          <Line
            dataKey="views"
            dot={false}
            filter="url(#gsc-detail-glow)"
            isAnimationActive={false}
            stroke={getChartColor(0)}
            strokeWidth={2}
            type="monotone"
            yAxisId="left"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </TooltipProvider>
  );
}

function GscTimeseriesChart({
  data,
}: {
  data: Array<{ date: string; clicks: number; impressions: number }>;
}) {
  const yAxisProps = useYAxisProps();

  return (
    <TooltipProvider>
      <ResponsiveContainer height={160} width="100%">
        <ComposedChart data={data}>
          <defs>
            <filter
              height="140%"
              id="gsc-detail-glow"
              width="140%"
              x="-20%"
              y="-20%"
            >
              <feGaussianBlur result="blur" stdDeviation="5" />
              <feComponentTransfer in="blur" result="dimmedBlur">
                <feFuncA slope="0.5" type="linear" />
              </feComponentTransfer>
              <feComposite
                in="SourceGraphic"
                in2="dimmedBlur"
                operator="over"
              />
            </filter>
          </defs>
          <CartesianGrid
            className="stroke-border"
            horizontal
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            {...X_AXIS_STYLE_PROPS}
            dataKey="date"
            tickFormatter={(v: string) => v.slice(5)}
            type="category"
          />
          <YAxis {...yAxisProps} yAxisId="left" />
          <YAxis {...yAxisProps} orientation="right" yAxisId="right" />
          <GscTooltip />
          <Line
            dataKey="clicks"
            dot={false}
            filter="url(#gsc-detail-glow)"
            isAnimationActive={false}
            stroke={getChartColor(0)}
            strokeWidth={2}
            type="monotone"
            yAxisId="left"
          />
          <Line
            dataKey="impressions"
            dot={false}
            filter="url(#gsc-detail-glow)"
            isAnimationActive={false}
            stroke={getChartColor(1)}
            strokeWidth={2}
            type="monotone"
            yAxisId="right"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </TooltipProvider>
  );
}
