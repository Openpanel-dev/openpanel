import { OverviewInterval } from '@/components/overview/overview-interval';
import { OverviewRange } from '@/components/overview/overview-range';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { DataTable } from '@/components/ui/data-table/data-table';
import {
  AnimatedSearchInput,
  DataTableToolbarContainer,
} from '@/components/ui/data-table/data-table-toolbar';
import { DataTableViewOptions } from '@/components/ui/data-table/data-table-view-options';
import { useTable } from '@/components/ui/data-table/use-table';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { type PageRow, useColumns } from './columns';

interface PagesTableProps {
  projectId: string;
}

export function PagesTable({ projectId }: PagesTableProps) {
  const trpc = useTRPC();
  const { range, interval, startDate, endDate } = useOverviewOptions();
  const { debouncedSearch, setSearch, search } = useSearchQueryState();

  const pagesQuery = useQuery(
    trpc.event.pages.queryOptions(
      { projectId, cursor: 1, take: 1000, search: undefined, range, interval },
      { placeholderData: keepPreviousData },
    ),
  );

  const connectionQuery = useQuery(
    trpc.gsc.getConnection.queryOptions({ projectId }),
  );

  const isGscConnected = !!(connectionQuery.data?.siteUrl);

  const gscPagesQuery = useQuery(
    trpc.gsc.getPages.queryOptions(
      {
        projectId,
        range,
        startDate: startDate ?? undefined,
        endDate: endDate ?? undefined,
        limit: 1000,
      },
      { enabled: isGscConnected },
    ),
  );

  const previousPagesQuery = useQuery(
    trpc.event.previousPages.queryOptions(
      { projectId, range, interval },
      { placeholderData: keepPreviousData },
    ),
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
    return (pagesQuery.data ?? []).map((p) => ({
      ...p,
      gsc: gscMap.get(p.origin + p.path),
    }));
  }, [pagesQuery.data, gscMap]);

  const filteredData = useMemo(() => {
    if (!debouncedSearch) return rawData;
    const q = debouncedSearch.toLowerCase();
    return rawData.filter(
      (p) =>
        p.path.toLowerCase().includes(q) ||
        p.origin.toLowerCase().includes(q) ||
        (p.title ?? '').toLowerCase().includes(q),
    );
  }, [rawData, debouncedSearch]);

  const columns = useColumns({ projectId, isGscConnected, previousMap });

  const { table } = useTable({
    columns,
    data: filteredData,
    loading: pagesQuery.isLoading,
    pageSize: 50,
    name: 'pages',
  });

  return (
    <>
      <DataTableToolbarContainer>
        <AnimatedSearchInput
          placeholder="Search pages"
          value={search ?? ''}
          onChange={setSearch}
        />
        <div className="flex items-center gap-2">
          <OverviewRange />
          <OverviewInterval />
          <DataTableViewOptions table={table} />
        </div>
      </DataTableToolbarContainer>
      <DataTable
        table={table}
        loading={pagesQuery.isLoading}
        empty={{
          title: 'No pages',
          description: debouncedSearch
            ? `No pages found matching "${debouncedSearch}"`
            : 'Integrate our web SDK to your site to get pages here.',
        }}
        onRowClick={(row) => {
          if (!isGscConnected) return;
          const page = row.original;
          pushModal('PageDetails', {
            type: 'page',
            projectId,
            value: page.origin + page.path,
          });
        }}
      />
    </>
  );
}
