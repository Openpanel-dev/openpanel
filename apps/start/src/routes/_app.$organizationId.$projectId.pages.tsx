import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { OverviewInterval } from '@/components/overview/overview-interval';
import { OverviewRange } from '@/components/overview/overview-range';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { FloatingPagination } from '@/components/pagination-floating';
import { ReportChart } from '@/components/report-chart';
import { Skeleton } from '@/components/skeleton';
import { Input } from '@/components/ui/input';
import { TableButtons } from '@/components/ui/table';
import { useAppContext } from '@/hooks/use-app-context';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';
import { PAGE_TITLES, createProjectTitle } from '@/utils/title';
import type { IChartRange, IInterval } from '@openpanel/validation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { parseAsInteger, useQueryState } from 'nuqs';
import { memo, useEffect, useMemo, useState } from 'react';

export const Route = createFileRoute('/_app/$organizationId/$projectId/pages')({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.PAGES),
        },
      ],
    };
  },
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const take = 20;
  const { range, interval } = useOverviewOptions();
  const [cursor, setCursor] = useQueryState(
    'cursor',
    parseAsInteger.withDefault(1),
  );

  const { debouncedSearch, setSearch, search } = useSearchQueryState();

  // Track if we should use backend search (when client-side filtering finds nothing)
  const [useBackendSearch, setUseBackendSearch] = useState(false);

  // Reset to client-side filtering when search changes
  useEffect(() => {
    setUseBackendSearch(false);
    setCursor(1);
  }, [debouncedSearch, setCursor]);

  // Query for all pages (without search) - used for client-side filtering
  const allPagesQuery = useQuery(
    trpc.event.pages.queryOptions(
      {
        projectId,
        cursor: 1,
        take: 1000,
        search: undefined, // No search - get all pages
        range,
        interval,
      },
      {
        placeholderData: keepPreviousData,
      },
    ),
  );

  // Query for backend search (only when client-side filtering finds nothing)
  const backendSearchQuery = useQuery(
    trpc.event.pages.queryOptions(
      {
        projectId,
        cursor: 1,
        take: 1000,
        search: debouncedSearch || undefined,
        range,
        interval,
      },
      {
        placeholderData: keepPreviousData,
        enabled: useBackendSearch && !!debouncedSearch,
      },
    ),
  );

  // Client-side filtering: filter all pages by search query
  const clientSideFiltered = useMemo(() => {
    if (!debouncedSearch || useBackendSearch) {
      return allPagesQuery.data ?? [];
    }
    const searchLower = debouncedSearch.toLowerCase();
    return (allPagesQuery.data ?? []).filter(
      (page) =>
        page.path.toLowerCase().includes(searchLower) ||
        page.origin.toLowerCase().includes(searchLower),
    );
  }, [allPagesQuery.data, debouncedSearch, useBackendSearch]);

  // Check if client-side filtering found results
  useEffect(() => {
    if (
      debouncedSearch &&
      !useBackendSearch &&
      allPagesQuery.isSuccess &&
      clientSideFiltered.length === 0
    ) {
      // No results from client-side filtering, switch to backend search
      setUseBackendSearch(true);
    }
  }, [
    debouncedSearch,
    useBackendSearch,
    allPagesQuery.isSuccess,
    clientSideFiltered.length,
  ]);

  // Determine which data source to use
  const allData = useBackendSearch
    ? (backendSearchQuery.data ?? [])
    : clientSideFiltered;

  const isLoading = useBackendSearch
    ? backendSearchQuery.isLoading
    : allPagesQuery.isLoading;

  // Client-side pagination: slice the items based on cursor
  const startIndex = (cursor - 1) * take;
  const endIndex = startIndex + take;
  const data = allData.slice(startIndex, endIndex);
  const totalPages = Math.ceil(allData.length / take);

  return (
    <PageContainer>
      <PageHeader
        title="Pages"
        description="Access all your pages here"
        className="mb-8"
      />
      <TableButtons>
        <OverviewRange />
        <OverviewInterval />
        <Input
          className="self-auto"
          placeholder="Search path"
          value={search ?? ''}
          onChange={(e) => {
            setSearch(e.target.value);
            setCursor(1);
          }}
        />
      </TableButtons>
      {data.length === 0 && !isLoading && (
        <FullPageEmptyState
          title="No pages"
          description={
            debouncedSearch
              ? `No pages found matching "${debouncedSearch}"`
              : 'Integrate our web sdk to your site to get pages here.'
          }
        />
      )}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PageCardSkeleton />
          <PageCardSkeleton />
          <PageCardSkeleton />
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map((page) => {
          return (
            <PageCard
              key={page.origin + page.path}
              page={page}
              range={range}
              interval={interval}
              projectId={projectId}
            />
          );
        })}
      </div>
      {allData.length !== 0 && (
        <div className="p-4">
          <FloatingPagination
            firstPage={cursor > 1 ? () => setCursor(1) : undefined}
            canNextPage={cursor < totalPages}
            canPreviousPage={cursor > 1}
            pageIndex={cursor - 1}
            nextPage={() => {
              setCursor((p) => Math.min(p + 1, totalPages));
            }}
            previousPage={() => {
              setCursor((p) => Math.max(p - 1, 1));
            }}
          />
        </div>
      )}
    </PageContainer>
  );
}

const PageCard = memo(
  ({
    page,
    range,
    interval,
    projectId,
  }: {
    page: RouterOutputs['event']['pages'][number];
    range: IChartRange;
    interval: IInterval;
    projectId: string;
  }) => {
    const number = useNumber();
    const { apiUrl } = useAppContext();
    return (
      <div className="card">
        <div className="row gap-4 justify-between p-4 py-2 items-center">
          <div className="row gap-2 items-center h-16">
            <img
              src={`${apiUrl}/misc/og?url=${page.origin}${page.path}`}
              alt={page.title}
              className="size-10 rounded-sm object-cover"
              loading="lazy"
              decoding="async"
            />
            <div className="col min-w-0">
              <div className="font-medium leading-[28px] truncate">
                {page.title}
              </div>
              <a
                target="_blank"
                rel="noreferrer"
                href={`${page.origin}${page.path}`}
                className="text-muted-foreground font-mono truncate hover:underline"
              >
                {page.path}
              </a>
            </div>
          </div>
        </div>
        <div className="row border-y">
          <div className="center-center col flex-1 p-4 py-2">
            <div className="font-medium text-xl font-mono">
              {number.formatWithUnit(page.avg_duration, 'min')}
            </div>
            <div className="text-muted-foreground whitespace-nowrap text-sm">
              duration
            </div>
          </div>
          <div className="center-center col flex-1 p-4 py-2">
            <div className="font-medium text-xl font-mono">
              {number.formatWithUnit(page.bounce_rate / 100, '%')}
            </div>
            <div className="text-muted-foreground whitespace-nowrap text-sm">
              bounce rate
            </div>
          </div>
          <div className="center-center col flex-1 p-4 py-2">
            <div className="font-medium text-xl font-mono">
              {number.format(page.sessions)}
            </div>
            <div className="text-muted-foreground whitespace-nowrap text-sm">
              sessions
            </div>
          </div>
        </div>
        <ReportChart
          options={{
            hideID: true,
            hideXAxis: true,
            hideYAxis: true,
            aspectRatio: 0.15,
          }}
          report={{
            lineType: 'linear',
            breakdowns: [],
            name: 'screen_view',
            metric: 'sum',
            range,
            interval,
            previous: true,

            chartType: 'linear',
            projectId,
            series: [
              {
                type: 'event',
                id: 'A',
                name: 'screen_view',
                segment: 'event',
                filters: [
                  {
                    id: 'path',
                    name: 'path',
                    value: [page.path],
                    operator: 'is',
                  },
                  {
                    id: 'origin',
                    name: 'origin',
                    value: [page.origin],
                    operator: 'is',
                  },
                ],
              },
            ],
          }}
        />
      </div>
    );
  },
);

const PageCardSkeleton = memo(() => {
  return (
    <div className="card">
      <div className="row gap-4 justify-between p-4 py-2 items-center">
        <div className="row gap-2 items-center h-16">
          <Skeleton className="size-10 rounded-sm" />
          <div className="col min-w-0">
            <Skeleton className="h-3 w-32 mb-2" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>
      <div className="row border-y">
        <div className="center-center col flex-1 p-4 py-2">
          <Skeleton className="h-6 w-16 mb-1" />
          <Skeleton className="h-4 w-12" />
        </div>
        <div className="center-center col flex-1 p-4 py-2">
          <Skeleton className="h-6 w-12 mb-1" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="center-center col flex-1 p-4 py-2">
          <Skeleton className="h-6 w-14 mb-1" />
          <Skeleton className="h-4 w-14" />
        </div>
      </div>
      <div className="p-4">
        <Skeleton className="h-16 w-full rounded" />
      </div>
    </div>
  );
});
