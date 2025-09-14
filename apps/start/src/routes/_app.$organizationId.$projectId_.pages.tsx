import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import { OverviewInterval } from '@/components/overview/overview-interval';
import { OverviewRange } from '@/components/overview/overview-range';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { ReportChart } from '@/components/report-chart';
import { Input } from '@/components/ui/input';
import { TableButtons } from '@/components/ui/table';
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';
import type { IChartRange, IInterval } from '@openpanel/validation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { parseAsInteger, useQueryState } from 'nuqs';
import { memo } from 'react';

export const Route = createFileRoute('/_app/$organizationId/$projectId_/pages')(
  {
    component: Component,
  },
);

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const take = 20;
  const { range, interval } = useOverviewOptions();
  const [filters] = useEventQueryFilters();
  const [cursor, setCursor] = useQueryState(
    'cursor',
    parseAsInteger.withDefault(0),
  );

  const { debouncedSearch, setSearch, search } = useSearchQueryState();
  const query = useQuery(
    trpc.event.pages.queryOptions(
      {
        projectId,
        cursor,
        take,
        search: debouncedSearch,
        range,
        interval,
        filters,
      },
      {
        placeholderData: keepPreviousData,
      },
    ),
  );
  const data = query.data ?? [];

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
        <OverviewFiltersDrawer projectId={projectId} mode="events" />
        <Input
          className="self-auto"
          placeholder="Search path"
          value={search ?? ''}
          onChange={(e) => {
            setSearch(e.target.value);
            setCursor(0);
          }}
        />
      </TableButtons>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map((page) => {
          return (
            <PageCard
              key={page.path}
              page={page}
              range={range}
              interval={interval}
              projectId={projectId}
            />
          );
        })}
      </div>
      <div className="p-4">
        <Pagination
          take={20}
          count={9999}
          cursor={cursor}
          setCursor={setCursor}
          className="self-auto"
          size="base"
          loading={query.isFetching}
        />
      </div>
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
    return (
      <div className="card">
        <div className="row gap-4 justify-between p-4 py-2 items-center">
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
            events: [
              {
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
