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
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import {
  useYAxisProps,
  X_AXIS_STYLE_PROPS,
} from '@/components/report-chart/common/axis';
import { Skeleton } from '@/components/skeleton';
import { useFormatDateInterval } from '@/hooks/use-format-date-interval';
import { useTRPC } from '@/integrations/trpc/react';
import { getChartColor } from '@/utils/theme';

interface ChartData {
  date: string;
  clicks: number;
  impressions: number;
}

const { TooltipProvider, Tooltip } = createChartTooltip<
  ChartData,
  { formatDate: (date: Date | string) => string }
>(({ data, context }) => {
  const item = data[0];
  if (!item) {
    return null;
  }
  return (
    <>
      <ChartTooltipHeader>
        <div>{context.formatDate(item.date)}</div>
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

interface GscClicksChartProps {
  projectId: string;
  value: string;
  type: 'page' | 'query';
}

export function GscClicksChart({
  projectId,
  value,
  type,
}: GscClicksChartProps) {
  const { range, startDate, endDate, interval } = useOverviewOptions();
  const trpc = useTRPC();
  const yAxisProps = useYAxisProps();
  const formatDateShort = useFormatDateInterval({ interval, short: true });
  const formatDateLong = useFormatDateInterval({ interval, short: false });

  const dateInput = {
    range,
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined,
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

  const isLoading =
    type === 'page' ? pageQuery.isLoading : queryQuery.isLoading;
  const timeseries =
    (type === 'page'
      ? pageQuery.data?.timeseries
      : queryQuery.data?.timeseries) ?? [];

  const data: ChartData[] = timeseries.map((r) => ({
    date: r.date,
    clicks: r.clicks,
    impressions: r.impressions,
  }));

  return (
    <div className="card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium text-sm">Clicks & Impressions</h3>
        <div className="flex items-center gap-4 text-muted-foreground text-xs">
          <span className="flex items-center gap-1.5">
            <span
              className="h-0.5 w-3 rounded-full"
              style={{ backgroundColor: getChartColor(0) }}
            />
            Clicks
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-0.5 w-3 rounded-full"
              style={{ backgroundColor: getChartColor(1) }}
            />
            Impressions
          </span>
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <TooltipProvider formatDate={formatDateLong}>
          <ResponsiveContainer height={160} width="100%">
            <ComposedChart data={data}>
              <defs>
                <filter
                  height="140%"
                  id="gsc-clicks-glow"
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
                tickFormatter={(v: string) => formatDateShort(v)}
                type="category"
              />
              <YAxis {...yAxisProps} yAxisId="left" />
              <YAxis {...yAxisProps} orientation="right" yAxisId="right" />
              <Tooltip />
              <Line
                dataKey="clicks"
                dot={false}
                filter="url(#gsc-clicks-glow)"
                isAnimationActive={false}
                stroke={getChartColor(0)}
                strokeWidth={2}
                type="monotone"
                yAxisId="left"
              />
              <Line
                dataKey="impressions"
                dot={false}
                filter="url(#gsc-clicks-glow)"
                isAnimationActive={false}
                stroke={getChartColor(1)}
                strokeWidth={2}
                type="monotone"
                yAxisId="right"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </TooltipProvider>
      )}
    </div>
  );
}
