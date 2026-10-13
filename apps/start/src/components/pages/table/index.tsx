import {
  TOP_PAGES_SORT_COLUMNS,
  type TopPagesSortColumn,
} from '@openpanel/core/modules/event/event.constants';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  PaginationState,
  SortingState,
  Updater,
} from '@tanstack/react-table';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { parseAsStringEnum, useQueryStates } from 'nuqs';
import { useMemo } from 'react';
import { type PageRow, useColumns } from './columns';
import { OverviewInterval } from '@/components/overview/overview-interval';
import { OverviewRange } from '@/components/overview/overview-range';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { DataTable } from '@/components/ui/data-table/data-table';
import {
  useDataTableColumnVisibility,
  useDataTablePagination,
} from '@/components/ui/data-table/data-table-hooks';
import {
  AnimatedSearchInput,
  DataTableToolbarContainer,
} from '@/components/ui/data-table/data-table-toolbar';
import { DataTableViewOptions } from '@/components/ui/data-table/data-table-view-options';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';

const PAGE_SIZE = 50;
const SORT_ORDERS = ['asc', 'desc'] as const;
const DEFAULT_SORT = { sortBy: 'sessions', sortOrder: 'desc' } as const;
const LOADING_DATA = Array.from({ length: 9 }, () => ({})) as PageRow[];

function isSortColumn(id: string): id is TopPagesSortColumn {
  return (TOP_PAGES_SORT_COLUMNS as readonly string[]).includes(id);
}

interface PagesTableProps {
  projectId: string;
}

export function PagesTable({ projectId }: PagesTableProps) {
  const trpc = useTRPC();
  const { range, interval, startDate, endDate } = useOverviewOptions();
  const { debouncedSearch, setSearch, search } = useSearchQueryState();
  const {
    page,
    setPage,
    state: pagination,
  } = useDataTablePagination(PAGE_SIZE);
  const [sort, setSort] = useQueryStates(
    {
      sortBy: parseAsStringEnum([...TOP_PAGES_SORT_COLUMNS]).withDefault(
        DEFAULT_SORT.sortBy
      ),
      sortOrder: parseAsStringEnum([...SORT_ORDERS]).withDefault(
        DEFAULT_SORT.sortOrder
      ),
    },
    { clearOnDefault: true, history: 'push' }
  );
  const sorting: SortingState = [
    { id: sort.sortBy, desc: sort.sortOrder === 'desc' },
  ];

  const pagesQuery = useQuery(
    trpc.event.pages.queryOptions(
      {
        projectId,
        search: debouncedSearch || undefined,
        range,
        interval,
        cursor: page - 1,
        take: PAGE_SIZE,
        sortBy: sort.sortBy,
        sortOrder: sort.sortOrder,
      },
      { placeholderData: keepPreviousData }
    )
  );
  const pages = pagesQuery.data?.data;
  const pageKeys = useMemo(
    () => (pages ?? []).map(({ origin, path }) => ({ origin, path })),
    [pages]
  );

  const connectionQuery = useQuery(
    trpc.gsc.getConnection.queryOptions({ projectId })
  );

  const isGscConnected = !!connectionQuery.data?.siteUrl;

  const gscPagesQuery = useQuery(
    trpc.gsc.getPages.queryOptions(
      {
        projectId,
        range,
        startDate: startDate ?? undefined,
        endDate: endDate ?? undefined,
        limit: 10_000,
      },
      { enabled: isGscConnected }
    )
  );

  const previousPagesQuery = useQuery(
    trpc.event.previousPages.queryOptions(
      { projectId, range, interval, pages: pageKeys },
      { placeholderData: keepPreviousData, enabled: pageKeys.length > 0 }
    )
  );

  const previousMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of previousPagesQuery.data ?? []) {
      map.set(p.origin + p.path, p.sessions);
    }
    return map;
  }, [previousPagesQuery.data]);

  const gscMap = useMemo(() => {
    const map = new Map<
      string,
      { clicks: number; impressions: number; ctr: number; position: number }
    >();
    for (const row of gscPagesQuery.data ?? []) {
      map.set(row.page, {
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      });
    }
    return map;
  }, [gscPagesQuery.data]);

  const rawData: PageRow[] = useMemo(() => {
    return (pages ?? []).map((p) => ({
      ...p,
      gsc: gscMap.get(p.origin + p.path),
    }));
  }, [pages, gscMap]);

  const columns = useColumns({ projectId, isGscConnected, previousMap });
  const { columnVisibility, setColumnVisibility, columnOrder, setColumnOrder } =
    useDataTableColumnVisibility(columns, 'pages');

  const table = useReactTable({
    data: pagesQuery.isLoading ? LOADING_DATA : rawData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    rowCount: pagesQuery.data?.meta.count,
    pageCount: Math.ceil((pagesQuery.data?.meta.count ?? 0) / PAGE_SIZE),
    filterFns: {
      isWithinRange: () => true,
    },
    state: { pagination, sorting, columnVisibility, columnOrder },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onPaginationChange: (updater: Updater<PaginationState>) => {
      const next =
        typeof updater === 'function' ? updater(pagination) : updater;
      setPage(next.pageIndex + 1);
    },
    onSortingChange: (updater: Updater<SortingState>) => {
      const [next] = typeof updater === 'function' ? updater(sorting) : updater;
      setSort(
        next && isSortColumn(next.id)
          ? { sortBy: next.id, sortOrder: next.desc ? 'desc' : 'asc' }
          : null
      );
      setPage(1);
    },
    getRowId: (row, index) =>
      row.origin === undefined ? `loading-${index}` : row.origin + row.path,
  });

  return (
    <>
      <DataTableToolbarContainer>
        <AnimatedSearchInput
          onChange={setSearch}
          placeholder="Search pages"
          value={search ?? ''}
        />
        <div className="flex items-center gap-2">
          <OverviewRange />
          <OverviewInterval />
          <DataTableViewOptions table={table} />
        </div>
      </DataTableToolbarContainer>
      <DataTable
        empty={{
          title: 'No pages',
          description: debouncedSearch
            ? `No pages found matching "${debouncedSearch}"`
            : 'Integrate our web SDK to your site to get pages here.',
        }}
        error={pagesQuery.isError}
        loading={pagesQuery.isLoading}
        onRowClick={(row) => {
          if (!isGscConnected) {
            return;
          }
          const page = row.original;
          pushModal('PageDetails', {
            type: 'page',
            projectId,
            value: page.origin + page.path,
          });
        }}
        table={table}
      />
    </>
  );
}
