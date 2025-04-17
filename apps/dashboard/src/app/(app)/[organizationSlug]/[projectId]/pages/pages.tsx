'use client';

import { TableButtons } from '@/components/data-table';
import { Input } from '@/components/ui/input';
import { useDebounceValue } from '@/hooks/useDebounceValue';
import { type RouterOutputs, api } from '@/trpc/client';
import { parseAsInteger, useQueryState } from 'nuqs';

import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import { OverviewInterval } from '@/components/overview/overview-interval';
import { OverviewRange } from '@/components/overview/overview-range';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { Pagination } from '@/components/pagination';
import { ReportChart } from '@/components/report-chart';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { useNumber } from '@/hooks/useNumerFormatter';
import type { IChartRange, IInterval } from '@openpanel/validation';
import { memo } from 'react';

export function Pages({ projectId }: { projectId: string }) {
  const take = 20;
  const { range, interval } = useOverviewOptions();
  const [filters, setFilters] = useEventQueryFilters();
  const [cursor, setCursor] = useQueryState(
    'cursor',
    parseAsInteger.withDefault(0),
  );
  const [search, setSearch] = useQueryState('search', {
    defaultValue: '',
    shallow: true,
  });
  const debouncedSearch = useDebounceValue(search, 500);
  const query = api.event.pages.useQuery(
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
      keepPreviousData: true,
    },
  );
  const data = query.data ?? [];

  return (
    <>
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
    </>
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
