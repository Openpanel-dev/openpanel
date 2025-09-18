import {
  type ColumnDef,
  type ColumnPinningState,
  type Updater,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type {
  ColumnFiltersState,
  PaginationState,
} from '@tanstack/react-table';
import type { Row } from '@tanstack/react-table';
import {
  type Options,
  type Parser,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  useQueryState,
  useQueryStates,
} from 'nuqs';
import React, { useMemo, useState } from 'react';

const nuqsOptions: Options = {
  shallow: true,
  history: 'push',
  clearOnDefault: true,
};

export function useTable<TData>({
  columns,
  pageSize,
  data,
  loading,
}: {
  columns: ColumnDef<TData>[];
  pageSize: number;
  data: TData[];
  loading: boolean;
}) {
  const [page, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions(nuqsOptions),
  );
  const [perPage, setPerPage] = useQueryState(
    'perPage',
    parseAsInteger.withDefault(pageSize ?? 10).withOptions(nuqsOptions),
  );
  const pagination: PaginationState = {
    pageIndex: page - 1,
    pageSize: perPage,
  };

  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({
    left: [
      ...columns
        .filter((column) => column.meta?.pinned === 'left')
        .map((column) => column.id!),
    ],
    right: columns
      .filter((column) => column.meta?.pinned === 'right')
      .map((column) => column.id!),
  });

  // Build per-key query parsers based on column metadata
  const filterParsers = useMemo(() => {
    return columns.reduce<
      Record<string, Parser<string> | Parser<string[]> | Parser<number[]>>
    >((acc, column) => {
      const columnId = (column.id ?? (column as any).accessorKey)?.toString();
      if (!columnId) return acc;
      const variant = column.meta?.variant;

      switch (variant) {
        case 'text':
        case 'number':
          acc[columnId] = parseAsString.withDefault('');
          break;
        case 'select':
          acc[columnId] = parseAsString.withDefault('');
          break;
        case 'multiSelect':
          acc[columnId] = parseAsArrayOf(parseAsString).withDefault([]);
          break;
        case 'date':
        case 'dateRange':
        case 'range':
          acc[columnId] = parseAsArrayOf(parseAsInteger).withDefault([]);
          break;
        default:
          // Non-filterable or unspecified variant -> skip
          break;
      }

      return acc;
    }, {});
  }, [columns]);

  const [qsFilters, setQsFilters] = useQueryStates(filterParsers, nuqsOptions);

  const initialColumnFilters: ColumnFiltersState = useMemo(() => {
    return Object.entries(qsFilters).reduce<ColumnFiltersState>(
      (filters, [key, value]) => {
        if (value === null || value === undefined) return filters;
        if (Array.isArray(value)) {
          if (value.length > 0) filters.push({ id: key, value });
        } else if (value !== '') {
          filters.push({ id: key, value });
        }
        return filters;
      },
      [],
    );
  }, [qsFilters]);

  const [columnFilters, setColumnFilters] =
    useState<ColumnFiltersState>(initialColumnFilters);

  // Keep table filters in sync when the URL-driven query state changes
  // (e.g., back/forward navigation or external updates)
  React.useEffect(() => {
    setColumnFilters(initialColumnFilters);
  }, [initialColumnFilters]);
  const isWithinRange = (
    row: Row<TData>,
    columnId: string,
    value: [number, number],
  ) => {
    const cellDate = row.getValue<Date>(columnId);
    if (!cellDate) return false;

    const [rawStart, rawEnd] = value; // epoch ms from date inputs (local)

    // Normalize to full-day local bounds to avoid timezone truncation
    const startDate = new Date(rawStart ?? rawEnd);
    const endDate = new Date(rawEnd ?? rawStart);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return false;
    }

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    const time = new Date(cellDate).getTime();
    return time >= startDate.getTime() && time <= endDate.getTime();
  };

  const table = useReactTable({
    columns,
    data: useMemo(
      () =>
        loading ? ([{}, {}, {}, {}, {}, {}, {}, {}, {}, {}] as TData[]) : data,
      [loading, data],
    ),
    debugTable: false,
    filterFns: {
      isWithinRange,
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
    onPaginationChange: (updaterOrValue: Updater<PaginationState>) => {
      const nextPagination =
        typeof updaterOrValue === 'function'
          ? updaterOrValue(pagination)
          : updaterOrValue;

      const nextPage = nextPagination.pageIndex + 1;
      const nextPerPage = nextPagination.pageSize;

      // Only write to the URL when values truly change to avoid reload loops
      if (nextPage !== page) void setPage(nextPage);
      if (nextPerPage !== perPage) void setPerPage(nextPerPage);
    },
    state: {
      pagination,
      columnPinning,
      columnFilters: loading ? [] : columnFilters,
    },
    onColumnPinningChange: setColumnPinning,
    onColumnFiltersChange: (updaterOrValue: Updater<ColumnFiltersState>) => {
      setColumnFilters((prev) => {
        const next =
          typeof updaterOrValue === 'function'
            ? updaterOrValue(prev)
            : updaterOrValue;

        const updates: Record<string, string | string[] | number[] | null> = {};
        const validKeys = new Set(Object.keys(filterParsers));

        for (const filter of next) {
          if (validKeys.has(filter.id)) {
            const value = filter.value as any;
            if (Array.isArray(value)) {
              const cleaned = value.filter(
                (v) => v !== undefined && v !== null,
              );
              updates[filter.id] = cleaned as any;
            } else {
              updates[filter.id] = value;
            }
          }
        }

        for (const prevFilter of prev) {
          if (
            !next.some((f) => f.id === prevFilter.id) &&
            validKeys.has(prevFilter.id)
          ) {
            updates[prevFilter.id] = null;
          }
        }

        void setPage(1);
        void setQsFilters(updates);
        return next;
      });
    },
  });

  return { table, loading };
}
