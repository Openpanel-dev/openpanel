import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { OverviewInterval } from '@/components/overview/overview-interval';
import { OverviewMetricCard } from '@/components/overview/overview-metric-card';
import { OverviewRange } from '@/components/overview/overview-range';
import { OverviewWidgetTable } from '@/components/overview/overview-widget-table';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { GscCannibalization } from '@/components/page/gsc-cannibalization';
import { GscCtrBenchmark } from '@/components/page/gsc-ctr-benchmark';
import { GscPositionChart } from '@/components/page/gsc-position-chart';
import { PagesInsights } from '@/components/page/pages-insights';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import {
  useYAxisProps,
  X_AXIS_STYLE_PROPS,
} from '@/components/report-chart/common/axis';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { Skeleton } from '@/components/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppParams } from '@/hooks/use-app-params';
import { useRangePageContext } from '@/hooks/use-page-context-helpers';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { getChartColor } from '@/utils/theme';
import { createProjectTitle } from '@/utils/title';

export const Route = createFileRoute('/_app/$organizationId/$projectId/seo')({
  component: SeoPage,
  head: () => ({
    meta: [{ title: createProjectTitle('SEO') }],
  }),
});

interface GscChartData {
  date: string;
  clicks: number;
  impressions: number;
}

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

function SeoPage() {
  const { projectId, organizationId } = useAppParams();
  useRangePageContext('seo');
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { range, startDate, endDate, interval } = useOverviewOptions();

  const dateInput = {
    range,
    interval,
    startDate,
    endDate,
  };

  const connectionQuery = useQuery(
    trpc.gsc.getConnection.queryOptions({ projectId })
  );

  const connection = connectionQuery.data;
  const isConnected = connection?.siteUrl;

  const overviewQuery = useQuery(
    trpc.gsc.getOverview.queryOptions(
      { projectId, ...dateInput, interval: interval ?? 'day' },
      { enabled: !!isConnected }
    )
  );

  const pagesQuery = useQuery(
    trpc.gsc.getPages.queryOptions(
      { projectId, ...dateInput, limit: 50 },
      { enabled: !!isConnected }
    )
  );

  const queriesQuery = useQuery(
    trpc.gsc.getQueries.queryOptions(
      { projectId, ...dateInput, limit: 50 },
      { enabled: !!isConnected }
    )
  );

  const searchEnginesQuery = useQuery(
    trpc.gsc.getSearchEngines.queryOptions({ projectId, ...dateInput })
  );

  const aiEnginesQuery = useQuery(
    trpc.gsc.getAiEngines.queryOptions({ projectId, ...dateInput })
  );

  const previousOverviewQuery = useQuery(
    trpc.gsc.getPreviousOverview.queryOptions(
      { projectId, ...dateInput, interval: interval ?? 'day' },
      { enabled: !!isConnected }
    )
  );

  const [pagesPage, setPagesPage] = useState(0);
  const [queriesPage, setQueriesPage] = useState(0);
  const pageSize = 15;

  const [pagesSearch, setPagesSearch] = useState('');
  const [queriesSearch, setQueriesSearch] = useState('');

  const pages = pagesQuery.data ?? [];
  const queries = queriesQuery.data ?? [];

  const filteredPages = useMemo(() => {
    if (!pagesSearch.trim()) {
      return pages;
    }
    const q = pagesSearch.toLowerCase();
    return pages.filter((row) => {
      return String(row.page).toLowerCase().includes(q);
    });
  }, [pages, pagesSearch]);

  const filteredQueries = useMemo(() => {
    if (!queriesSearch.trim()) {
      return queries;
    }
    const q = queriesSearch.toLowerCase();
    return queries.filter((row) => {
      return String(row.query).toLowerCase().includes(q);
    });
  }, [queries, queriesSearch]);

  const paginatedPages = useMemo(
    () => filteredPages.slice(pagesPage * pageSize, (pagesPage + 1) * pageSize),
    [filteredPages, pagesPage, pageSize]
  );

  const paginatedQueries = useMemo(
    () =>
      filteredQueries.slice(
        queriesPage * pageSize,
        (queriesPage + 1) * pageSize
      ),
    [filteredQueries, queriesPage, pageSize]
  );

  const pagesPageCount = Math.ceil(filteredPages.length / pageSize) || 1;
  const queriesPageCount = Math.ceil(filteredQueries.length / pageSize) || 1;

  if (connectionQuery.isLoading) {
    return (
      <PageContainer>
        <PageHeader description="Google Search Console data" title="SEO" />
        <div className="mt-8 space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </PageContainer>
    );
  }

  if (!isConnected) {
    return (
      <FullPageEmptyState
        className="pt-[20vh]"
        description="Connect Google Search Console to track your search impressions, clicks, and keyword rankings."
        icon={SearchIcon}
        title="No SEO data yet"
      >
        <Button
          onClick={() =>
            navigate({
              to: '/$organizationId/$projectId/settings/gsc',
              params: { organizationId, projectId },
            })
          }
        >
          Connect Google Search Console
        </Button>
      </FullPageEmptyState>
    );
  }

  const overview = overviewQuery.data ?? [];
  const prevOverview = previousOverviewQuery.data ?? [];

  const sumOverview = (rows: typeof overview) =>
    rows.reduce(
      (acc, row) => ({
        clicks: acc.clicks + row.clicks,
        impressions: acc.impressions + row.impressions,
        ctr: acc.ctr + row.ctr,
        position: acc.position + row.position,
      }),
      { clicks: 0, impressions: 0, ctr: 0, position: 0 }
    );

  const totals = sumOverview(overview);
  const prevTotals = sumOverview(prevOverview);
  const n = Math.max(overview.length, 1);
  const pn = Math.max(prevOverview.length, 1);

  return (
    <PageContainer>
      <PageHeader
        actions={
          <>
            <OverviewRange />
            <OverviewInterval />
          </>
        }
        description={`Search performance for ${connection.siteUrl}`}
        title="SEO"
      />

      <div className="mt-8 space-y-8">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="card col-span-1 grid grid-cols-2 overflow-hidden rounded-md lg:col-span-2">
            <OverviewMetricCard
              data={overview.map((r) => ({ current: r.clicks, date: r.date }))}
              id="clicks"
              isLoading={overviewQuery.isLoading}
              label="Clicks"
              metric={{ current: totals.clicks, previous: prevTotals.clicks }}
            />
            <OverviewMetricCard
              data={overview.map((r) => ({
                current: r.impressions,
                date: r.date,
              }))}
              id="impressions"
              isLoading={overviewQuery.isLoading}
              label="Impressions"
              metric={{
                current: totals.impressions,
                previous: prevTotals.impressions,
              }}
            />
            <OverviewMetricCard
              data={overview.map((r) => ({
                current: r.ctr * 100,
                date: r.date,
              }))}
              id="ctr"
              isLoading={overviewQuery.isLoading}
              label="Avg CTR"
              metric={{
                current: (totals.ctr / n) * 100,
                previous: (prevTotals.ctr / pn) * 100,
              }}
              unit="%"
            />
            <OverviewMetricCard
              data={overview.map((r) => ({
                current: r.position,
                date: r.date,
              }))}
              id="position"
              inverted
              isLoading={overviewQuery.isLoading}
              label="Avg Position"
              metric={{
                current: totals.position / n,
                previous: prevTotals.position / pn,
              }}
            />
          </div>
          <SearchEngines
            engines={searchEnginesQuery.data?.engines ?? []}
            isLoading={searchEnginesQuery.isLoading}
            previousTotal={searchEnginesQuery.data?.previousTotal ?? 0}
            total={searchEnginesQuery.data?.total ?? 0}
          />
          <AiEngines
            engines={aiEnginesQuery.data?.engines ?? []}
            isLoading={aiEnginesQuery.isLoading}
            previousTotal={aiEnginesQuery.data?.previousTotal ?? 0}
            total={aiEnginesQuery.data?.total ?? 0}
          />
        </div>

        <GscChart data={overview} isLoading={overviewQuery.isLoading} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <GscPositionChart
            data={overview}
            isLoading={overviewQuery.isLoading}
          />
          <GscCtrBenchmark
            data={pagesQuery.data ?? []}
            isLoading={pagesQuery.isLoading}
          />
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <GscTable
            isLoading={pagesQuery.isLoading}
            keyField="page"
            keyLabel="Page"
            maxClicks={Math.max(...paginatedPages.map((p) => p.clicks), 1)}
            onNextPage={() =>
              setPagesPage((p) => Math.min(pagesPageCount - 1, p + 1))
            }
            onPreviousPage={() => setPagesPage((p) => Math.max(0, p - 1))}
            onRowClick={(value) =>
              pushModal('PageDetails', { type: 'page', projectId, value })
            }
            onSearchChange={(v) => {
              setPagesSearch(v);
              setPagesPage(0);
            }}
            pageCount={pagesPageCount}
            pageIndex={pagesPage}
            pageSize={pageSize}
            rows={paginatedPages}
            searchPlaceholder="Search pages"
            searchValue={pagesSearch}
            title="Top pages"
            totalCount={filteredPages.length}
          />
          <GscTable
            isLoading={queriesQuery.isLoading}
            keyField="query"
            keyLabel="Query"
            maxClicks={Math.max(...paginatedQueries.map((q) => q.clicks), 1)}
            onNextPage={() =>
              setQueriesPage((p) => Math.min(queriesPageCount - 1, p + 1))
            }
            onPreviousPage={() => setQueriesPage((p) => Math.max(0, p - 1))}
            onRowClick={(value) =>
              pushModal('PageDetails', { type: 'query', projectId, value })
            }
            onSearchChange={(v) => {
              setQueriesSearch(v);
              setQueriesPage(0);
            }}
            pageCount={queriesPageCount}
            pageIndex={queriesPage}
            pageSize={pageSize}
            rows={paginatedQueries}
            searchPlaceholder="Search queries"
            searchValue={queriesSearch}
            title="Top queries"
            totalCount={filteredQueries.length}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <GscCannibalization
            endDate={endDate ?? undefined}
            interval={interval ?? 'day'}
            projectId={projectId}
            range={range}
            startDate={startDate ?? undefined}
          />
          <PagesInsights projectId={projectId} />
        </div>
      </div>
    </PageContainer>
  );
}

function TrafficSourceWidget({
  title,
  engines,
  total,
  previousTotal,
  isLoading,
  emptyMessage,
}: {
  title: string;
  engines: Array<{ name: string; sessions: number }>;
  total: number;
  previousTotal: number;
  isLoading: boolean;
  emptyMessage: string;
}) {
  const displayed =
    engines.length > 8
      ? [
          ...engines.slice(0, 7),
          {
            name: 'Others',
            sessions: engines.slice(7).reduce((s, d) => s + d.sessions, 0),
          },
        ]
      : engines.slice(0, 8);

  const max = displayed[0]?.sessions ?? 1;
  const pctChange =
    previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : null;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b p-4">
        <h3 className="font-medium text-sm">{title}</h3>
        {!isLoading && total > 0 && (
          <div className="flex items-center gap-2">
            <span className="font-medium font-mono text-sm tabular-nums">
              {total.toLocaleString()}
            </span>
            {pctChange !== null && (
              <span
                className={`font-mono text-xs tabular-nums ${pctChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
              >
                {pctChange >= 0 ? '+' : ''}
                {pctChange.toFixed(1)}%
              </span>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2">
        {isLoading &&
          [1, 2, 3, 4].map((i) => (
            <div className="flex items-center gap-2.5 px-4 py-2.5" key={i}>
              <div className="size-4 animate-pulse rounded-sm bg-muted" />
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              <div className="ml-auto h-3 w-8 animate-pulse rounded bg-muted" />
            </div>
          ))}
        {!isLoading && engines.length === 0 && (
          <p className="col-span-2 px-4 py-6 text-center text-muted-foreground text-xs">
            {emptyMessage}
          </p>
        )}
        {!isLoading &&
          displayed.map((engine) => {
            const pct = total > 0 ? (engine.sessions / total) * 100 : 0;
            const barPct = (engine.sessions / max) * 100;
            return (
              <div className="relative px-4 py-2.5" key={engine.name}>
                <div
                  className="absolute inset-y-0 left-0 bg-muted/50"
                  style={{ width: `${barPct}%` }}
                />
                <div className="relative flex items-center gap-2">
                  {engine.name !== 'Others' && (
                    <SerieIcon
                      className="size-3.5 shrink-0 rounded-sm"
                      name={engine.name}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs capitalize">
                    {engine.name.replace(/\..+$/, '')}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums">
                    {engine.sessions.toLocaleString()}
                  </span>
                  <span className="shrink-0 font-mono text-muted-foreground text-xs">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function SearchEngines(props: {
  engines: Array<{ name: string; sessions: number }>;
  total: number;
  previousTotal: number;
  isLoading: boolean;
}) {
  return (
    <TrafficSourceWidget
      {...props}
      emptyMessage="No search traffic in this period"
      title="Search engines"
    />
  );
}

function AiEngines(props: {
  engines: Array<{ name: string; sessions: number }>;
  total: number;
  previousTotal: number;
  isLoading: boolean;
}) {
  return (
    <TrafficSourceWidget
      {...props}
      emptyMessage="No AI traffic in this period"
      title="AI referrals"
    />
  );
}

function GscChart({
  data,
  isLoading,
}: {
  data: Array<{ date: string; clicks: number; impressions: number }>;
  isLoading: boolean;
}) {
  const color = getChartColor(0);
  const yAxisProps = useYAxisProps();

  return (
    <div className="card p-4">
      <h3 className="mb-4 font-medium text-sm">Clicks & Impressions</h3>
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <TooltipProvider>
          <ResponsiveContainer height={200} width="100%">
            <ComposedChart data={data}>
              <defs>
                <filter
                  height="140%"
                  id="gsc-line-glow"
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
                filter="url(#gsc-line-glow)"
                isAnimationActive={false}
                stroke={color}
                strokeWidth={2}
                type="monotone"
                yAxisId="left"
              />
              <Line
                dataKey="impressions"
                dot={false}
                filter="url(#gsc-line-glow)"
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

interface GscTableRow {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  [key: string]: string | number;
}

function GscTable({
  title,
  rows,
  keyField,
  keyLabel,
  maxClicks,
  isLoading,
  onRowClick,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  totalCount,
  pageIndex,
  pageSize,
  pageCount,
  onPreviousPage,
  onNextPage,
}: {
  title: string;
  rows: GscTableRow[];
  keyField: string;
  keyLabel: string;
  maxClicks: number;
  isLoading: boolean;
  onRowClick?: (value: string) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  totalCount?: number;
  pageIndex?: number;
  pageSize?: number;
  pageCount?: number;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
}) {
  const showPagination =
    totalCount != null &&
    pageSize != null &&
    pageCount != null &&
    onPreviousPage != null &&
    onNextPage != null &&
    pageIndex != null;
  const canPreviousPage = (pageIndex ?? 0) > 0;
  const canNextPage = (pageIndex ?? 0) < (pageCount ?? 1) - 1;
  const rangeStart = totalCount ? (pageIndex ?? 0) * (pageSize ?? 0) + 1 : 0;
  const rangeEnd = Math.min(
    (pageIndex ?? 0) * (pageSize ?? 0) + (pageSize ?? 0),
    totalCount ?? 0
  );
  if (isLoading) {
    return (
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-medium text-sm">{title}</h3>
        </div>
        <OverviewWidgetTable
          columns={[
            {
              name: keyLabel,
              width: 'w-full',
              render: () => <Skeleton className="h-4 w-2/3" />,
            },
            {
              name: 'Clicks',
              width: '70px',
              render: () => <Skeleton className="h-4 w-10" />,
            },
            {
              name: 'Impr.',
              width: '70px',
              render: () => <Skeleton className="h-4 w-10" />,
            },
            {
              name: 'CTR',
              width: '60px',
              render: () => <Skeleton className="h-4 w-8" />,
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
      </div>
    );
  }

  return (
    <div className="card">
      <div className="border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="font-medium text-sm">{title}</h3>
          {showPagination && (
            <div className="flex shrink-0 items-center gap-2">
              <span className="whitespace-nowrap text-muted-foreground text-xs">
                {totalCount === 0
                  ? '0 results'
                  : `${rangeStart}-${rangeEnd} of ${totalCount}`}
              </span>
              <Pagination
                canNextPage={canNextPage}
                canPreviousPage={canPreviousPage}
                nextPage={onNextPage}
                pageIndex={pageIndex}
                previousPage={onPreviousPage}
              />
            </div>
          )}
        </div>
        {onSearchChange != null && (
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="rounded-none border-0 border-t bg-transparent pl-9 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground focus-visible:ring-offset-0"
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder ?? 'Search'}
              type="search"
              value={searchValue ?? ''}
            />
          </div>
        )}
      </div>
      <OverviewWidgetTable
        columns={[
          {
            name: keyLabel,
            width: 'w-full',
            render(item) {
              return (
                <div className="min-w-0 overflow-hidden">
                  <button
                    className="block w-full truncate text-left font-mono text-xs hover:underline"
                    onClick={() => onRowClick?.(String(item[keyField]))}
                    type="button"
                  >
                    {String(item[keyField])}
                  </button>
                </div>
              );
            },
          },
          {
            name: 'Clicks',
            width: '70px',
            getSortValue: (item) => item.clicks,
            render(item) {
              return (
                <span className="font-mono font-semibold text-xs">
                  {item.clicks.toLocaleString()}
                </span>
              );
            },
          },
          {
            name: 'Impr.',
            width: '70px',
            getSortValue: (item) => item.impressions,
            render(item) {
              return (
                <span className="font-mono font-semibold text-xs">
                  {item.impressions.toLocaleString()}
                </span>
              );
            },
          },
          {
            name: 'CTR',
            width: '60px',
            getSortValue: (item) => item.ctr,
            render(item) {
              return (
                <span className="font-mono font-semibold text-xs">
                  {(item.ctr * 100).toFixed(1)}%
                </span>
              );
            },
          },
          {
            name: 'Pos.',
            width: '55px',
            getSortValue: (item) => item.position,
            render(item) {
              return (
                <span className="font-mono font-semibold text-xs">
                  {item.position.toFixed(1)}
                </span>
              );
            },
          },
        ]}
        data={rows}
        getColumnPercentage={(item) => item.clicks / maxClicks}
        keyExtractor={(item) => String(item[keyField])}
      />
    </div>
  );
}
