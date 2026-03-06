import type { IServiceGroup } from '@openpanel/db';
import type { UseQueryResult } from '@tanstack/react-query';
import type { PaginationState, Table, Updater } from '@tanstack/react-table';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { memo } from 'react';
import { useGroupColumns } from './columns';
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
import type { RouterOutputs } from '@/trpc/client';
import { arePropsEqual } from '@/utils/are-props-equal';

const PAGE_SIZE = 50;

interface Props {
  query: UseQueryResult<RouterOutputs['group']['list'], unknown>;
  pageSize?: number;
  toolbarLeft?: React.ReactNode;
}

const LOADING_DATA = [{}, {}, {}, {}, {}, {}, {}, {}, {}] as IServiceGroup[];

export const GroupsTable = memo(
  ({ query, pageSize = PAGE_SIZE, toolbarLeft }: Props) => {
    const { data, isLoading } = query;
    const columns = useGroupColumns();

    const { setPage, state: pagination } = useDataTablePagination(pageSize);
    const {
      columnVisibility,
      setColumnVisibility,
      columnOrder,
      setColumnOrder,
    } = useDataTableColumnVisibility(columns, 'groups');

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
        columnVisibility,
        columnOrder,
      },
      onColumnVisibilityChange: setColumnVisibility,
      onColumnOrderChange: setColumnOrder,
      onPaginationChange: (updaterOrValue: Updater<PaginationState>) => {
        const nextPagination =
          typeof updaterOrValue === 'function'
            ? updaterOrValue(pagination)
            : updaterOrValue;
        setPage(nextPagination.pageIndex + 1);
      },
      getRowId: (row, index) => (row as IServiceGroup).id ?? `loading-${index}`,
    });

    return (
      <>
        <GroupsTableToolbar table={table} toolbarLeft={toolbarLeft} />
        <DataTable
          empty={{
            title: 'No groups found',
            description:
              'Groups represent companies, teams, or other entities that events belong to.',
          }}
          loading={isLoading}
          table={table}
        />
      </>
    );
  },
  arePropsEqual(['query.isLoading', 'query.data', 'pageSize', 'toolbarLeft'])
);

function GroupsTableToolbar({
  table,
  toolbarLeft,
}: {
  table: Table<IServiceGroup>;
  toolbarLeft?: React.ReactNode;
}) {
  const { search, setSearch } = useSearchQueryState();
  return (
    <DataTableToolbarContainer>
      <div className="flex flex-wrap items-center gap-2">
        {toolbarLeft}
        <AnimatedSearchInput
          onChange={setSearch}
          placeholder="Search groups..."
          value={search}
        />
      </div>
      <DataTableViewOptions table={table} />
    </DataTableToolbarContainer>
  );
}
