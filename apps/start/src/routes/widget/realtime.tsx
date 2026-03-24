import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type React from 'react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { z } from 'zod';
import { AnimatedNumber } from '@/components/animated-number';
import {
  ChartTooltipContainer,
  ChartTooltipHeader,
  ChartTooltipItem,
} from '@/components/charts/chart-tooltip';
import { LogoSquare } from '@/components/logo';
import { Ping } from '@/components/ping';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { useNumber } from '@/hooks/use-numer-formatter';
import useWS from '@/hooks/use-ws';
import { useTRPC } from '@/integrations/trpc/react';
import { countries } from '@/translations/countries';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

const widgetSearchSchema = z.object({
  shareId: z.string(),
  limit: z.number().default(10),
  color: z.string().optional(),
});

export const Route = createFileRoute('/widget/realtime')({
  component: RouteComponent,
  validateSearch: widgetSearchSchema,
});

function RouteComponent() {
  const { shareId, limit, color } = Route.useSearch();
  const trpc = useTRPC();

  // Fetch widget data
  const { data: widgetData, isLoading } = useQuery(
    trpc.widget.realtimeData.queryOptions({ shareId })
  );

  if (isLoading) {
    return <RealtimeWidgetSkeleton limit={limit} />;
  }

  if (!widgetData) {
    return (
      <div className="center-center col flex h-screen w-full bg-background p-4 text-foreground">
        <LogoSquare className="mb-4 size-10" />
        <h1 className="font-semibold text-xl">Widget not found</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          This widget is not available or has been removed.
        </p>
      </div>
    );
  }

  return (
    <RealtimeWidget
      color={color}
      data={widgetData}
      limit={limit}
      shareId={shareId}
    />
  );
}

interface RealtimeWidgetProps {
  shareId: string;
  limit: number;
  color: string | undefined;
  data: RouterOutputs['widget']['realtimeData'];
}

function RealtimeWidget({ shareId, data, limit, color }: RealtimeWidgetProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // WebSocket subscription for real-time updates
  useWS<number>(
    `/live/visitors/${data.projectId}`,
    () => {
      if (!document.hidden) {
        queryClient.refetchQueries(
          trpc.widget.realtimeData.queryFilter({ shareId })
        );
      }
    },
    {
      debounce: {
        delay: 1000,
        maxWait: 60_000,
      },
    }
  );

  const maxDomain =
    Math.max(...data.histogram.map((item) => item.sessionCount), 1) * 1.2;

  const grids = (() => {
    const countries = data.countries.length > 0 ? 1 : 0;
    const referrers = data.referrers.length > 0 ? 1 : 0;
    const paths = data.paths.length > 0 ? 1 : 0;
    const value = countries + referrers + paths;
    if (value === 3) {
      return 'md:grid-cols-3';
    }
    if (value === 2) {
      return 'md:grid-cols-2';
    }
    return 'md:grid-cols-1';
  })();

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground">
      {/* Header with live counter */}
      <div className="p-6 pb-3">
        <div className="flex h-4 w-full items-center justify-between">
          <div className="flex w-full items-center gap-3">
            <Ping />
            <div className="flex-1 font-medium text-muted-foreground text-sm">
              USERS IN LAST 30 MINUTES
            </div>
            {data.project.domain && <SerieIcon name={data.project.domain} />}
          </div>
        </div>

        <div className="row">
          <div className="h-18 font-bold font-mono text-6xl text-foreground">
            <AnimatedNumber value={data.liveCount} />
          </div>
        </div>

        <div className="-mt-4 flex h-20 w-full flex-col">
          <div className="flex-1">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                data={data.histogram}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                <Tooltip
                  content={CustomTooltip}
                  cursor={{ fill: 'var(--def-100)', radius: 4 }}
                />
                <XAxis
                  axisLine={false}
                  dataKey="time"
                  interval="preserveStartEnd"
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                  tickLine={false}
                  ticks={[
                    data.histogram[0].time,
                    data.histogram[data.histogram.length - 1].time,
                  ]}
                />
                <YAxis domain={[0, maxDomain]} hide />
                <Bar
                  dataKey="sessionCount"
                  fill={color || 'var(--chart-0)'}
                  isAnimationActive={false}
                  radius={[4, 4, 4, 4]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {(data.countries.length > 0 ||
        data.referrers.length > 0 ||
        data.paths.length > 0) && (
        <div className="hide-scrollbar flex flex-1 flex-col gap-6 overflow-auto border-t p-6">
          <div className={cn('grid grid-cols-1 gap-6', grids)}>
            {/* Countries */}
            {data.countries.length > 0 && (
              <div className="flex flex-col">
                <div className="mb-3 font-medium text-muted-foreground text-xs">
                  COUNTRY
                </div>
                <div className="col">
                  {(() => {
                    const { visible, rest, restCount } = getRestItems(
                      data.countries,
                      limit
                    );
                    return (
                      <>
                        {visible.map((item) => (
                          <RowItem count={item.count} key={item.country}>
                            <div className="flex items-center gap-2">
                              <SerieIcon name={item.country} />
                              <span className="text-sm">
                                {countries[
                                  item.country as keyof typeof countries
                                ] || item.country}
                              </span>
                            </div>
                          </RowItem>
                        ))}
                        {rest.length > 0 && (
                          <RestRow
                            firstName={
                              countries[
                                rest[0].country as keyof typeof countries
                              ] || rest[0].country
                            }
                            restCount={rest.length}
                            totalCount={restCount}
                            type="countries"
                          />
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Referrers */}
            {data.referrers.length > 0 && (
              <div className="flex flex-col">
                <div className="mb-3 font-medium text-muted-foreground text-xs">
                  REFERRER
                </div>
                <div className="col">
                  {(() => {
                    const { visible, rest, restCount } = getRestItems(
                      data.referrers,
                      limit
                    );
                    return (
                      <>
                        {visible.map((item) => (
                          <RowItem count={item.count} key={item.referrer}>
                            <div className="flex items-center gap-2">
                              <SerieIcon name={item.referrer} />
                              <span className="truncate text-sm">
                                {item.referrer}
                              </span>
                            </div>
                          </RowItem>
                        ))}
                        {rest.length > 0 && (
                          <RestRow
                            firstName={rest[0].referrer}
                            restCount={rest.length}
                            totalCount={restCount}
                            type="referrers"
                          />
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Paths */}
            {data.paths.length > 0 && (
              <div className="flex flex-col">
                <div className="mb-3 font-medium text-muted-foreground text-xs">
                  PATH
                </div>
                <div className="col">
                  {(() => {
                    const { visible, rest, restCount } = getRestItems(
                      data.paths,
                      limit
                    );
                    return (
                      <>
                        {visible.map((item) => (
                          <RowItem count={item.count} key={item.path}>
                            <span className="truncate text-sm">
                              {item.path}
                            </span>
                          </RowItem>
                        ))}
                        {rest.length > 0 && (
                          <RestRow
                            firstName={rest[0].path}
                            restCount={rest.length}
                            totalCount={restCount}
                            type="paths"
                          />
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Custom tooltip component that uses portals to escape overflow hidden
const CustomTooltip = ({ active, payload }: any) => {
  const number = useNumber();

  if (!(active && payload && payload.length)) {
    return null;
  }

  const data = payload[0].payload;

  return (
    <ChartTooltipContainer className="max-w-[100px]">
      <ChartTooltipHeader>
        <div>{data.time}</div>
      </ChartTooltipHeader>
      <ChartTooltipItem color={getChartColor(0)} innerClassName="row gap-1">
        <div className="flex-1">Visitors</div>
        <div>{number.short(data.sessionCount)}</div>
      </ChartTooltipItem>
    </ChartTooltipContainer>
  );
};

function RowItem({
  children,
  count,
}: {
  children: React.ReactNode;
  count: number;
}) {
  const number = useNumber();
  return (
    <div className="-mx-3 flex h-10 items-center justify-between border-b px-3 py-2 text-sm hover:bg-foreground/5">
      {children}
      <span className="font-semibold">{number.short(count)}</span>
    </div>
  );
}

function getRestItems<T extends { count: number }>(
  items: T[],
  limit: number
): { visible: T[]; rest: T[]; restCount: number } {
  const visible = items.slice(0, limit);
  const rest = items.slice(limit);
  const restCount = rest.reduce((sum, item) => sum + item.count, 0);
  return { visible, rest, restCount };
}

function RestRow({
  firstName,
  restCount,
  totalCount,
  type,
}: {
  firstName: string;
  restCount: number;
  totalCount: number;
  type: 'countries' | 'referrers' | 'paths';
}) {
  const number = useNumber();
  const otherCount = restCount - 1;
  const typeLabel =
    type === 'countries'
      ? otherCount === 1
        ? 'country'
        : 'countries'
      : type === 'referrers'
        ? otherCount === 1
          ? 'referrer'
          : 'referrers'
        : otherCount === 1
          ? 'path'
          : 'paths';

  return (
    <div className="-mx-3 flex h-10 items-center justify-between border-b px-3 py-2 text-sm hover:bg-foreground/5">
      <span className="truncate">
        {firstName} and {otherCount} more {typeLabel}...
      </span>
      <span className="font-semibold">{number.short(totalCount)}</span>
    </div>
  );
}

// Pre-generated skeleton keys to avoid index-based keys in render
const SKELETON_KEYS = {
  countries: [
    'country-0',
    'country-1',
    'country-2',
    'country-3',
    'country-4',
    'country-5',
    'country-6',
    'country-7',
    'country-8',
    'country-9',
  ],
  referrers: [
    'referrer-0',
    'referrer-1',
    'referrer-2',
    'referrer-3',
    'referrer-4',
    'referrer-5',
    'referrer-6',
    'referrer-7',
    'referrer-8',
    'referrer-9',
  ],
  paths: [
    'path-0',
    'path-1',
    'path-2',
    'path-3',
    'path-4',
    'path-5',
    'path-6',
    'path-7',
    'path-8',
    'path-9',
  ],
};

// Pre-generated skeleton histogram data
const SKELETON_HISTOGRAM = [
  24, 48, 21, 32, 19, 16, 52, 14, 11, 7, 12, 18, 25, 65, 55, 62, 9, 68, 10, 31,
  58, 70, 10, 47, 43, 10, 38, 35, 41, 28,
];

function RealtimeWidgetSkeleton({ limit }: { limit: number }) {
  const itemCount = Math.min(limit, 5);

  return (
    <div className="flex h-screen w-full animate-pulse flex-col bg-background text-foreground">
      {/* Header with live counter */}
      <div className="border-b p-6 pb-3">
        <div className="flex h-4 w-full items-center justify-between">
          <div className="flex w-full items-center gap-3">
            <div className="size-2 rounded-full bg-muted" />
            <div className="flex-1 font-medium text-muted-foreground text-sm">
              USERS IN LAST 30 MINUTES
            </div>
          </div>
          <div className="size-4 shrink-0 rounded bg-muted" />
        </div>

        <div className="row">
          <div className="row flex h-18 items-center gap-1 py-4 font-bold font-mono text-6xl">
            <div className="h-full w-6 rounded bg-muted" />
            <div className="h-full w-6 rounded bg-muted" />
          </div>
        </div>

        <div className="-mt-4 flex h-20 w-full flex-col pb-2.5">
          <div className="row h-full flex-1 gap-1">
            {SKELETON_HISTOGRAM.map((item, index) => (
              <div
                className="mt-auto h-full w-full rounded bg-muted"
                key={index.toString()}
                style={{ height: `${item}%` }}
              />
            ))}
          </div>
          <div className="row justify-between pt-2">
            <div className="h-3 w-8 rounded bg-muted" />
            <div className="h-3 w-8 rounded bg-muted" />
          </div>
        </div>
      </div>

      <div className="hide-scrollbar flex flex-1 flex-col gap-6 overflow-auto p-6">
        {/* Countries, Referrers, and Paths skeleton */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Countries skeleton */}
          <div className="flex flex-col">
            <div className="mb-3 font-medium text-muted-foreground text-xs">
              COUNTRY
            </div>
            <div className="col">
              {SKELETON_KEYS.countries.slice(0, itemCount).map((key) => (
                <RowItemSkeleton key={key} />
              ))}
            </div>
          </div>

          {/* Referrers skeleton */}
          <div className="flex flex-col">
            <div className="mb-3 font-medium text-muted-foreground text-xs">
              REFERRER
            </div>
            <div className="col">
              {SKELETON_KEYS.referrers.slice(0, itemCount).map((key) => (
                <RowItemSkeleton key={key} />
              ))}
            </div>
          </div>

          {/* Paths skeleton */}
          <div className="flex flex-col">
            <div className="mb-3 font-medium text-muted-foreground text-xs">
              PATH
            </div>
            <div className="col">
              {SKELETON_KEYS.paths.slice(0, itemCount).map((key) => (
                <RowItemSkeleton key={key} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RowItemSkeleton() {
  return (
    <div className="-mx-3 flex h-10 items-center justify-between border-b px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <div className="size-5 rounded bg-muted" />
        <div className="h-4 w-24 rounded bg-muted" />
      </div>
      <div className="h-4 w-8 rounded bg-muted" />
    </div>
  );
}
