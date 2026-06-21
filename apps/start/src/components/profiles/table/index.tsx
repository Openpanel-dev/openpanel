import type { IServiceProfile } from '@openpanel/db';
import type { UseQueryResult } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { PaginationState, Table, Updater } from '@tanstack/react-table';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useColumns } from './columns';
import { TableFilterPills } from '@/components/filters/TableFilterPills';
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
    const { t } = useTranslation();
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
      getRowId: (row, index) => row.id ?? `loading-${index}`,
    });

    return (
      <>
        <ProfileTableToolbar table={table} />
        <DataTable
          empty={{
            title: t('profiles.empty_title'),
            description: t('profiles.empty_description'),
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
  const { t } = useTranslation();
  const { search, setSearch } = useSearchQueryState();

  return (
    <DataTableToolbarContainer>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <AnimatedSearchInput
          onChange={setSearch}
          placeholder={t('profiles.search_placeholder')}
          value={search}
        />
        <TableFilterPills
          urlKey="f"
          categories={['profile', 'group', 'cohort']}
          title={t('profiles.filters_title')}
        />
      </div>
      <DataTableViewOptions table={table} />
    </DataTableToolbarContainer>
  );
}
