import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import { useLocalStorage } from 'usehooks-ts';
import { useColumns } from './columns';
import type { RouterInputs, RouterOutputs } from '@/trpc/client';

// Custom hook for persistent column visibility
const usePersistentColumnVisibility = (columns: any[]) => {
  const [savedVisibility, setSavedVisibility] = useLocalStorage<
    Record<string, boolean>
  >('@op:sessions-table-column-visibility', {});

  // Create column visibility from saved state, defaulting to true (visible)
  const columnVisibility = useMemo(() => {
    return columns.reduce(
      (acc, column) => {
        const columnId = column.id || column.accessorKey;
        if (columnId) {
          acc[columnId] = savedVisibility[columnId] ?? true;
        }
        return acc;
      },
      {} as Record<string, boolean>
    );
  }, [columns, savedVisibility]);

  const handleColumnVisibilityChange = (updater: any) => {
    const newVisibility =
      typeof updater === 'function' ? updater(columnVisibility) : updater;
    setSavedVisibility(newVisibility);
  };

  return {
    columnVisibility,
    setColumnVisibility: handleColumnVisibilityChange,
  };
};

import type { IServiceSession } from '@openpanel/db';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { Table } from '@tanstack/react-table';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { TRPCInfiniteData } from '@trpc/tanstack-react-query';
import { Loader2Icon, SlidersHorizontalIcon } from 'lucide-react';
import { last } from 'ramda';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { useInViewport } from 'react-in-viewport';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { Skeleton } from '@/components/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AnimatedSearchInput,
  DataTableToolbarContainer,
} from '@/components/ui/data-table/data-table-toolbar';
import { DataTableViewOptions } from '@/components/ui/data-table/data-table-view-options';
import type { FilterDefinition } from '@/components/ui/filter-dropdown';
import { FilterDropdown } from '@/components/ui/filter-dropdown';
import { useAppParams } from '@/hooks/use-app-params';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useSessionFilters } from '@/hooks/use-session-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';

type Props = {
  query: UseInfiniteQueryResult<
    TRPCInfiniteData<
      RouterInputs['session']['list'],
      RouterOutputs['session']['list']
    >,
    unknown
  >;
};

const LOADING_DATA = [{}, {}, {}, {}, {}, {}, {}, {}, {}] as IServiceSession[];
const ROW_HEIGHT = 40;

interface VirtualizedSessionsTableProps {
  table: Table<IServiceSession>;
  data: IServiceSession[];
  isLoading: boolean;
}

interface VirtualRowProps {
  row: any;
  virtualRow: any;
  headerColumns: any[];
  scrollMargin: number;
  isLoading: boolean;
  headerColumnsHash: string;
  onRowClick?: (row: any) => void;
}

const VirtualRow = memo(
  function VirtualRow({
    row,
    virtualRow,
    headerColumns,
    scrollMargin,
    isLoading,
    onRowClick,
  }: VirtualRowProps) {
    return (
      <div
        className={cn(
          'group/row absolute top-0 left-0 w-full border-b transition-colors hover:bg-muted/50',
          onRowClick && 'cursor-pointer'
        )}
        data-index={virtualRow.index}
        onClick={
          onRowClick
            ? (e) => {
                if ((e.target as HTMLElement).closest('a, button')) {
                  return;
                }
                onRowClick(row);
              }
            : undefined
        }
        ref={virtualRow.measureElement}
        style={{
          transform: `translateY(${virtualRow.start - scrollMargin}px)`,
          display: 'grid',
          gridTemplateColumns: headerColumns
            .map((col) => `${col.getSize()}px`)
            .join(' '),
          minWidth: 'fit-content',
          minHeight: ROW_HEIGHT,
        }}
      >
        {row.getVisibleCells().map((cell: any) => {
          const width = `${cell.column.getSize()}px`;
          return (
            <div
              className="flex items-center whitespace-nowrap p-2 px-4 align-middle"
              key={cell.id}
              style={{
                width,
                overflow: 'hidden',
              }}
            >
              {isLoading ? (
                <Skeleton className="h-4 w-3/5" />
              ) : cell.column.columnDef.cell ? (
                typeof cell.column.columnDef.cell === 'function' ? (
                  cell.column.columnDef.cell(cell.getContext())
                ) : (
                  cell.column.columnDef.cell
                )
              ) : (
                (cell.getValue() as React.ReactNode)
              )}
            </div>
          );
        })}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.row.id === nextProps.row.id &&
      prevProps.virtualRow.index === nextProps.virtualRow.index &&
      prevProps.virtualRow.start === nextProps.virtualRow.start &&
      prevProps.virtualRow.size === nextProps.virtualRow.size &&
      prevProps.isLoading === nextProps.isLoading &&
      prevProps.headerColumnsHash === nextProps.headerColumnsHash &&
      prevProps.onRowClick === nextProps.onRowClick
    );
  }
);

const VirtualizedSessionsTable = ({
  table,
  data,
  isLoading,
  onRowClick,
}: VirtualizedSessionsTableProps & { onRowClick?: (row: any) => void }) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const headerColumns = table.getAllLeafColumns().filter((col) => {
    return table.getState().columnVisibility[col.id] !== false;
  });

  const rowVirtualizer = useWindowVirtualizer({
    count: data.length,
    estimateSize: () => ROW_HEIGHT, // Estimated row height
    overscan: 10,
    scrollMargin: parentRef.current?.offsetTop ?? 0,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const headerColumnsHash = headerColumns.map((col) => col.id).join(',');

  return (
    <div
      className="w-full overflow-x-auto rounded-md border bg-card"
      ref={parentRef}
    >
      {/* Table Header */}
      <div
        className="sticky top-0 z-10 border-b bg-card"
        style={{
          display: 'grid',
          gridTemplateColumns: headerColumns
            .map((col) => `${col.getSize()}px`)
            .join(' '),
          minWidth: 'fit-content',
        }}
      >
        {headerColumns.map((column) => {
          const header = column.columnDef.header;
          const width = `${column.getSize()}px`;
          return (
            <div
              className="flex h-10 items-center whitespace-nowrap px-4 text-left font-semibold text-[10px] text-foreground uppercase"
              key={column.id}
              style={{
                width,
              }}
            >
              {typeof header === 'function' ? header({} as any) : header}
            </div>
          );
        })}
      </div>

      {!isLoading && data.length === 0 && (
        <FullPageEmptyState
          description="Looks like you haven't inserted any events yet."
          title="No sessions found"
        />
      )}

      {/* Table Body */}
      <div
        className="relative w-full"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          minHeight: 'fit-content',
          minWidth: 'fit-content',
        }}
      >
        {virtualRows.map((virtualRow) => {
          const row = table.getRowModel().rows[virtualRow.index];
          if (!row) {
            return null;
          }

          return (
            <VirtualRow
              headerColumns={headerColumns}
              headerColumnsHash={headerColumnsHash}
              isLoading={isLoading}
              key={row.id}
              onRowClick={onRowClick}
              row={row}
              scrollMargin={rowVirtualizer.options.scrollMargin}
              virtualRow={{
                ...virtualRow,
                measureElement: rowVirtualizer.measureElement,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export const SessionsTable = ({ query }: Props) => {
  const { isLoading } = query;
  const columns = useColumns();
  const navigate = useNavigate();
  const { organizationId, projectId } = useAppParams();

  const handleRowClick = useCallback(
    (row: any) => {
      navigate({
        to: '/$organizationId/$projectId/sessions/$sessionId',
        params: { organizationId, projectId, sessionId: row.original.id },
      });
    },
    [navigate, organizationId, projectId]
  );

  const data = useMemo(() => {
    if (isLoading) {
      return LOADING_DATA;
    }

    return query.data?.pages?.flatMap((p) => p.items) ?? [];
  }, [query.data]);

  // const { setPage, state: pagination } = useDataTablePagination();
  const { columnVisibility, setColumnVisibility } =
    usePersistentColumnVisibility(columns);

  const table = useReactTable({
    data,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    columns,
    rowCount: 50,
    pageCount: 1,
    filterFns: {
      isWithinRange: () => true,
    },
    state: {
      columnVisibility,
    },
    onColumnVisibilityChange: setColumnVisibility,
    getRowId: (row, index) => row.id ?? `loading-${index}`,
  });

  const inViewportRef = useRef<HTMLDivElement>(null);
  const { inViewport, enterCount } = useInViewport(inViewportRef, undefined, {
    disconnectOnLeave: true,
  });

  const hasNextPage = last(query.data?.pages ?? [])?.meta.next;

  useEffect(() => {
    if (
      hasNextPage &&
      data.length > 0 &&
      inViewport &&
      enterCount > 0 &&
      query.isFetchingNextPage === false
    ) {
      query.fetchNextPage();
    }
  }, [inViewport, enterCount, hasNextPage]);

  return (
    <>
      <SessionTableToolbar table={table} />
      <VirtualizedSessionsTable
        data={data}
        isLoading={isLoading}
        onRowClick={handleRowClick}
        table={table}
      />
      <div className="center-center h-10 w-full pt-4" ref={inViewportRef}>
        <div
          className={cn(
            'center-center size-8 rounded-full border bg-background opacity-0 transition-opacity',
            query.isFetchingNextPage && 'opacity-100'
          )}
        >
          <Loader2Icon className="size-4 animate-spin" />
        </div>
      </div>
    </>
  );
};

const SESSION_FILTER_KEY_TO_FIELD: Record<string, string> = {
  referrer: 'referrer_name',
  country: 'country',
  os: 'os',
  browser: 'browser',
  device: 'device',
};

const SESSION_FILTER_DEFINITIONS: FilterDefinition[] = [
  { key: 'referrer', label: 'Referrer', type: 'select' },
  { key: 'country', label: 'Country', type: 'select' },
  { key: 'os', label: 'OS', type: 'select' },
  { key: 'browser', label: 'Browser', type: 'select' },
  { key: 'device', label: 'Device', type: 'select' },
  { key: 'entryPage', label: 'Entry page', type: 'string' },
  { key: 'exitPage', label: 'Exit page', type: 'string' },
  { key: 'minPageViews', label: 'Min page views', type: 'number' },
  { key: 'maxPageViews', label: 'Max page views', type: 'number' },
  { key: 'minEvents', label: 'Min events', type: 'number' },
  { key: 'maxEvents', label: 'Max events', type: 'number' },
];

function SessionTableToolbar({ table }: { table: Table<IServiceSession> }) {
  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { search, setSearch } = useSearchQueryState();
  const { values, setValue, activeCount } = useSessionFilters();

  const loadOptions = useCallback(
    (key: string) => {
      const field = SESSION_FILTER_KEY_TO_FIELD[key];
      if (!field) {
        return Promise.resolve([]);
      }
      return queryClient.fetchQuery(
        trpc.session.distinctValues.queryOptions({
          projectId,
          field: field as
            | 'referrer_name'
            | 'country'
            | 'os'
            | 'browser'
            | 'device',
        })
      );
    },
    [trpc, queryClient, projectId]
  );

  return (
    <DataTableToolbarContainer>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <AnimatedSearchInput
          onChange={setSearch}
          placeholder="Search sessions by path, referrer..."
          value={search}
        />
        <FilterDropdown
          definitions={SESSION_FILTER_DEFINITIONS}
          loadOptions={loadOptions}
          onChange={setValue}
          values={values}
        >
          <Button
            className={cn(
              'border-dashed',
              activeCount > 0 && 'border-primary border-solid'
            )}
            size="sm"
            variant="outline"
          >
            <SlidersHorizontalIcon className="mr-2 size-4" />
            Filters
            {activeCount > 0 && (
              <Badge className="ml-2 rounded-full px-1.5 py-0 text-xs">
                {activeCount}
              </Badge>
            )}
          </Button>
        </FilterDropdown>
      </div>
      <DataTableViewOptions table={table} />
    </DataTableToolbarContainer>
  );
}
