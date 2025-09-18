import type {
  ColumnDef,
  PaginationState,
  VisibilityState,
} from '@tanstack/react-table';
import { parseAsInteger, useQueryState } from 'nuqs';
import { useState } from 'react';

export const useDataTablePagination = (pageSize = 10) => {
  const [page, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions({
      clearOnDefault: true,
      history: 'push',
    }),
  );
  const state: PaginationState = {
    pageIndex: page - 1,
    pageSize: pageSize,
  };
  return { page, setPage, state };
};

export const useDataTableColumnVisibility = <TData,>(
  columns: ColumnDef<TData>[],
) => {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    columns.reduce((acc, column) => {
      acc[column.id!] = column.meta?.hidden ?? false;
      return acc;
    }, {} as VisibilityState),
  );
  return { columnVisibility, setColumnVisibility };
};
