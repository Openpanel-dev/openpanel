import type { IServiceProfile } from '@openpanel/db';
import type { UseQueryResult } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type {
  PaginationState,
  SortingState,
  Table,
  Updater,
} from '@tanstack/react-table';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { memo, useCallback } from 'react';
import { useColumns } from './columns';
import { DataTable } from '@/components/ui/data-table/data-table';
import {
  useDataTableColumnVisibility,
  useDataTablePagination,
  useDataTableSort,
} from '@/components/ui/data-table/data-table-hooks';
import {
  AnimatedSearchInput,
  DataTableToolbarContainer,
} from '@/components/ui/data-table/data-table-toolbar';
import { DataTableViewOptions } from '@/components/ui/data-table/data-table-view-options';
import { useAppParams } from '@/hooks/use-app-params';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import type { RouterOutputs } from '@/trpc/client';
import { arePropsEqual } from '@/utils/are-props-equal';

const PAGE_SIZE = 50;

type Props = {
  query: UseQueryResult<RouterOutputs['profile']['list'], unknown>;
  type: 'profiles' | 'power-users';
  pageSize?: number;
};

const LOADING_DATA = [{}, {}, {}, {}, {}, {}, {}, {}, {}] as IServiceProfile[];

export const ProfilesTable = memo(
  ({ type, query, pageSize = PAGE_SIZE }: Props) => {
    const { data, isLoading } = query;
    const columns = useColumns(type);
    const navigate = useNavigate();
    const { organizationId, projectId } = useAppParams();

    const handleRowClick = useCallback(
      (row: any) => {
        navigate({
          to: '/$organizationId/$projectId/profiles/$profileId',
          params: {
            organizationId,
            projectId,
            profileId: encodeURIComponent(row.original.id),
          },
        });
      },
      [navigate, organizationId, projectId]
    );

    const { setPage, state: pagination } = useDataTablePagination(pageSize);
    const defaultSortBy =
      type === 'power-users' ? 'eventCount' : 'createdAt';
    const { sortBy, sortDirection, setSort } = useDataTableSort(
      defaultSortBy,
      'desc',
    );
    const sortingState: SortingState = sortBy
      ? [{ id: sortBy, desc: sortDirection === 'desc' }]
      : [];
    const {
      columnVisibility,
      setColumnVisibility,
      columnOrder,
      setColumnOrder,
    } = useDataTableColumnVisibility(columns, 'profiles');

    const table = useReactTable({
      data: isLoading ? LOADING_DATA : (data?.data ?? []),
      getCoreRowModel: getCoreRowModel(),
      manualPagination: true,
      manualFiltering: true,
      manualSorting: true,
      columns,
      rowCount: data?.meta.count,
      pageCount: Math.ceil(
        (data?.meta.count || 0) / (pagination.pageSize || 1)
      ),
      filterFns: {
        isWithinRange: () => true,
      },
      state: {
        pagination,
        sorting: sortingState,
        columnVisibility,
        columnOrder,
      },
      onColumnVisibilityChange: setColumnVisibility,
      onColumnOrderChange: setColumnOrder,
      onSortingChange: (updaterOrValue: Updater<SortingState>) => {
        const next =
          typeof updaterOrValue === 'function'
            ? updaterOrValue(sortingState)
            : updaterOrValue;
        setPage(1);
        setSort(next[0] ?? null);
      },
      onPaginationChange: (updaterOrValue: Updater<PaginationState>) => {
        const nextPagination =
          typeof updaterOrValue === 'function'
            ? updaterOrValue(pagination)
            : updaterOrValue;
        setPage(nextPagination.pageIndex + 1);
      },
      getRowId: (row, index) => row.id ?? `loading-${index}`,
    });

    return (
      <>
        <ProfileTableToolbar table={table} />
        <DataTable
          empty={{
            title: 'No profiles',
            description: "Looks like you haven't identified any profiles yet.",
          }}
          loading={isLoading}
          onRowClick={handleRowClick}
          table={table}
        />
      </>
    );
  },
  arePropsEqual(['query.isLoading', 'query.data', 'type', 'pageSize'])
);

function ProfileTableToolbar({ table }: { table: Table<IServiceProfile> }) {
  const { search, setSearch } = useSearchQueryState();
  return (
    <DataTableToolbarContainer>
      <AnimatedSearchInput
        onChange={setSearch}
        placeholder="Search profiles"
        value={search}
      />
      <DataTableViewOptions table={table} />
    </DataTableToolbarContainer>
  );
}
