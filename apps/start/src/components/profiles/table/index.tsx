import type { UseQueryResult } from '@tanstack/react-query';

import { useDataTableColumnVisibility } from '@/components/ui/data-table/data-table-hooks';
import type { RouterOutputs } from '@/trpc/client';
import { useColumns } from './columns';

import { DataTable } from '@/components/ui/data-table/data-table';
import { useDataTablePagination } from '@/components/ui/data-table/data-table-hooks';
import {
  AnimatedSearchInput,
  DataTableToolbarContainer,
} from '@/components/ui/data-table/data-table-toolbar';
import { DataTableViewOptions } from '@/components/ui/data-table/data-table-view-options';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { arePropsEqual } from '@/utils/are-props-equal';
import type { IServiceProfile } from '@openpanel/db';
import type { PaginationState, Table, Updater } from '@tanstack/react-table';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { memo } from 'react';

type Props = {
  query: UseQueryResult<RouterOutputs['profile']['list'], unknown>;
  type: 'profiles' | 'power-users';
};

const LOADING_DATA = [{}, {}, {}, {}, {}, {}, {}, {}, {}] as IServiceProfile[];

export const ProfilesTable = memo(
  ({ type, query }: Props) => {
    const { data, isLoading } = query;
    const columns = useColumns(type);

    const { setPage, state: pagination } = useDataTablePagination();
    const { columnVisibility, setColumnVisibility } =
      useDataTableColumnVisibility(columns);

    const table = useReactTable({
      data: isLoading ? LOADING_DATA : (data?.data ?? []),
      getCoreRowModel: getCoreRowModel(),
      manualPagination: true,
      manualFiltering: true,
      manualSorting: true,
      columns,
      rowCount: data?.meta.count,
      pageCount: Math.ceil(
        (data?.meta.count || 0) / (pagination.pageSize || 1),
      ),
      filterFns: {
        isWithinRange: () => true,
      },
      state: {
        pagination,
        columnVisibility,
      },
      onColumnVisibilityChange: setColumnVisibility,
      onPaginationChange: (updaterOrValue: Updater<PaginationState>) => {
        const nextPagination =
          typeof updaterOrValue === 'function'
            ? updaterOrValue(pagination)
            : updaterOrValue;
        setPage(nextPagination.pageIndex + 1);
      },
    });

    return (
      <>
        <ProfileTableToolbar table={table} />
        <DataTable
          table={table}
          loading={isLoading}
          empty={{
            title: 'No profiles',
            description: "Looks like you haven't identified any profiles yet.",
          }}
        />
      </>
    );
  },
  arePropsEqual(['query.isLoading', 'query.data', 'type']),
);

function ProfileTableToolbar({ table }: { table: Table<IServiceProfile> }) {
  const { search, setSearch } = useSearchQueryState();
  return (
    <DataTableToolbarContainer>
      <AnimatedSearchInput
        placeholder="Search profiles"
        value={search}
        onChange={setSearch}
      />
      <DataTableViewOptions table={table} />
    </DataTableToolbarContainer>
  );
}
