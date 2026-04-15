import type {
  ColumnDef,
  PaginationState,
  VisibilityState,
} from '@tanstack/react-table';
import { parseAsInteger, parseAsString, parseAsStringEnum, useQueryState } from 'nuqs';
import { useEffect, useState } from 'react';
import { useLocalStorage, useReadLocalStorage } from 'usehooks-ts';

/**
 * Sync a table's manual sort state to the URL query string. The `sortBy`
 * value is passed straight into the tRPC input, so the set of allowed
 * values should match the server-side `ProfileListSortBy` enum.
 */
export const useDataTableSort = (
  defaultSortBy: string | null = null,
  defaultDirection: 'asc' | 'desc' = 'desc',
) => {
  const [sortBy, setSortBy] = useQueryState(
    'sort',
    parseAsString
      .withDefault(defaultSortBy ?? '')
      .withOptions({ clearOnDefault: true, history: 'push' }),
  );
  const [direction, setDirection] = useQueryState(
    'dir',
    parseAsStringEnum(['asc', 'desc'])
      .withDefault(defaultDirection)
      .withOptions({ clearOnDefault: true, history: 'push' }),
  );
  const effectiveSortBy = sortBy || defaultSortBy || null;
  return {
    sortBy: effectiveSortBy,
    sortDirection: direction,
    setSort: (next: { id: string; desc: boolean } | null) => {
      if (!next) {
        setSortBy('');
        setDirection(defaultDirection);
        return;
      }
      setSortBy(next.id);
      setDirection(next.desc ? 'desc' : 'asc');
    },
  };
};

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

export const useReadColumnVisibility = (persistentKey: string) => {
  return useReadLocalStorage<Record<string, boolean>>(
    `@op:${persistentKey}-column-visibility`,
  );
};

export const useDataTableColumnVisibility = <TData,>(
  columns: ColumnDef<TData>[],
  persistentKey: string,
) => {
  const [columnVisibility, setColumnVisibility] = useLocalStorage<
    Record<string, boolean>
  >(
    `@op:${persistentKey}-column-visibility`,
    columns.reduce((acc, column) => {
      // Use accessorKey as fallback if id is not provided
      const columnId = column.id || (column as any).accessorKey;
      if (columnId) {
        acc[columnId] =
          typeof column.meta?.hidden === 'boolean'
            ? !column.meta?.hidden
            : true;
      }
      return acc;
    }, {} as VisibilityState),
  );

  // somewhat hack
  // Set initial column visibility,
  // otherwise will not useReadColumnVisibility be updated
  useEffect(() => {
    setColumnVisibility(columnVisibility);
  }, []);

  const [columnOrder, setColumnOrder] = useLocalStorage<string[]>(
    `@op:${persistentKey}-column-order`,
    columns.map((column) => column.id!),
  );

  return { columnVisibility, setColumnVisibility, columnOrder, setColumnOrder };
};
