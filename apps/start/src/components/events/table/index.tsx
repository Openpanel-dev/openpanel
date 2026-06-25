import { FullPageEmptyState } from '@/components/full-page-empty-state';
import {
  OverviewFilterButton,
  OverviewFiltersButtons,
} from '@/components/overview/filters/overview-filters-buttons';
import { Skeleton } from '@/components/skeleton';
import { Button } from '@/components/ui/button';
import { useDataTableColumnVisibility } from '@/components/ui/data-table/data-table-hooks';
import { DataTableToolbarContainer } from '@/components/ui/data-table/data-table-toolbar';
import { DataTableViewOptions } from '@/components/ui/data-table/data-table-view-options';
import { useAppParams } from '@/hooks/use-app-params';
import { pushModal } from '@/modals';
import type { RouterInputs, RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import type { IServiceEvent } from '@openpanel/db';
import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import type { Table } from '@tanstack/react-table';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { TRPCInfiniteData } from '@trpc/tanstack-react-query';
import { format } from 'date-fns';
import { CalendarIcon, FilterIcon, Loader2Icon } from 'lucide-react';
import { parseAsIsoDateTime, useQueryState } from 'nuqs';
import { last } from 'ramda';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInViewport } from 'react-in-viewport';
import EventListener from '../event-listener';
import { useColumns } from './columns';
import { EventRowDetails } from './event-row-details';

type Props = {
  query: UseInfiniteQueryResult<
    TRPCInfiniteData<
      RouterInputs['event']['events'],
      RouterOutputs['event']['events']
    >,
    unknown
  >;
};

const LOADING_DATA = [{}, {}, {}, {}, {}, {}, {}, {}, {}] as IServiceEvent[];
const ROW_HEIGHT = 40;

interface VirtualizedEventsTableProps {
  table: Table<IServiceEvent>;
  data: IServiceEvent[];
  isLoading: boolean;
  expandedId: string | null;
  onToggle: (id: string) => void;
}

interface VirtualRowProps {
  row: any;
  virtualRow: any;
  headerColumns: any[];
  scrollMargin: number;
  isLoading: boolean;
  headerColumnsHash: string;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}

const VirtualRow = memo(
  function VirtualRow({
    row,
    virtualRow,
    headerColumns,
    scrollMargin,
    isLoading,
    isExpanded,
    onToggle,
  }: VirtualRowProps) {
    return (
      <div
        key={virtualRow.key}
        data-index={virtualRow.index}
        data-expanded={isExpanded}
        ref={virtualRow.measureElement}
        className="absolute top-0 left-0 w-full border-b transition-colors group/exp"
        style={{
          transform: `translateY(${virtualRow.start - scrollMargin}px)`,
          minWidth: 'fit-content',
        }}
      >
        <div
          role="button"
          tabIndex={isLoading ? undefined : 0}
          onClick={() => {
            if (!isLoading && row.original?.id) {
              onToggle(row.original.id);
            }
          }}
          onKeyDown={(e) => {
            if (
              (e.key === 'Enter' || e.key === ' ') &&
              e.target === e.currentTarget &&
              !isLoading &&
              row.original?.id
            ) {
              e.preventDefault();
              onToggle(row.original.id);
            }
          }}
          className={cn(
            'outline-none transition-colors focus-visible:bg-muted/50',
            isExpanded ? 'bg-muted/50' : 'hover:bg-muted/50',
            !isLoading && 'cursor-pointer',
          )}
          style={{
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
                key={cell.id}
                className="flex items-center p-2 px-4 align-middle whitespace-nowrap"
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
        {isExpanded && !isLoading && row.original?.id && (
          <EventRowDetails event={row.original} />
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.row.id === nextProps.row.id &&
      prevProps.row.original === nextProps.row.original &&
      prevProps.virtualRow.index === nextProps.virtualRow.index &&
      prevProps.virtualRow.start === nextProps.virtualRow.start &&
      prevProps.virtualRow.size === nextProps.virtualRow.size &&
      prevProps.isLoading === nextProps.isLoading &&
      prevProps.isExpanded === nextProps.isExpanded &&
      prevProps.headerColumnsHash === nextProps.headerColumnsHash
    );
  },
);

const VirtualizedEventsTable = ({
  table,
  data,
  isLoading,
  expandedId,
  onToggle,
}: VirtualizedEventsTableProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const headerColumns = table.getAllLeafColumns().filter((col) => {
    return table.getState().columnVisibility[col.id] !== false;
  });

  const rowVirtualizer = useWindowVirtualizer({
    count: data.length,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    scrollMargin: parentRef.current?.offsetTop ?? 0,
  });

  // Re-measure only when the column set changes. Row expansion is handled
  // locally by each row's measureElement ResizeObserver — calling measure()
  // here would reset the whole size cache and jump the scroll position.
  useEffect(() => {
    rowVirtualizer.measure();
  }, [headerColumns.length]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const headerColumnsHash = headerColumns.map((col) => col.id).join(',');
  return (
    <div
      ref={parentRef}
      className="w-full overflow-x-auto border rounded-md bg-card"
    >
      {/* Table Header */}
      <div
        className="sticky top-0 z-10 bg-card border-b"
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
              key={column.id}
              className="flex items-center h-10 px-4 text-left text-[10px] uppercase text-foreground font-semibold whitespace-nowrap"
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
          title="No events"
          description={"Start sending events and you'll see them here"}
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
          if (!row) return null;

          return (
            <VirtualRow
              key={virtualRow.key}
              row={row}
              virtualRow={{
                ...virtualRow,
                measureElement: rowVirtualizer.measureElement,
              }}
              headerColumns={headerColumns}
              headerColumnsHash={headerColumnsHash}
              scrollMargin={rowVirtualizer.options.scrollMargin}
              isLoading={isLoading}
              isExpanded={!isLoading && row.original?.id === expandedId}
              onToggle={onToggle}
            />
          );
        })}
      </div>
    </div>
  );
};

export const EventsTable = ({ query }: Props) => {
  const { isLoading } = query;
  const columns = useColumns();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const onToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const data = useMemo(() => {
    if (isLoading) {
      return LOADING_DATA;
    }

    return query.data?.pages?.flatMap((p) => p.data) ?? [];
  }, [query.data, isLoading]);

  const { columnVisibility, setColumnVisibility, columnOrder, setColumnOrder } =
    useDataTableColumnVisibility(columns, 'events');

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
      columnOrder,
    },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
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
      <EventsTableToolbar query={query} table={table} />
      <VirtualizedEventsTable
        table={table}
        data={data}
        isLoading={isLoading}
        expandedId={expandedId}
        onToggle={onToggle}
      />
      <div className="w-full h-10 center-center pt-4" ref={inViewportRef}>
        <div
          className={cn(
            'size-8 bg-background rounded-full center-center border opacity-0 transition-opacity',
            query.isFetchingNextPage && 'opacity-100',
          )}
        >
          <Loader2Icon className="size-4 animate-spin" />
        </div>
      </div>
    </>
  );
};

function EventsTableToolbar({
  query,
  table,
}: {
  query: Props['query'];
  table: Table<IServiceEvent>;
}) {
  const { projectId } = useAppParams();
  const [startDate, setStartDate] = useQueryState(
    'startDate',
    parseAsIsoDateTime,
  );
  const [endDate, setEndDate] = useQueryState('endDate', parseAsIsoDateTime);

  return (
    <DataTableToolbarContainer>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <EventListener onRefresh={() => query.refetch()} />
        <Button
          variant="outline"
          size="sm"
          icon={CalendarIcon}
          onClick={() => {
            pushModal('DateRangerPicker', {
              onChange: ({ startDate, endDate }) => {
                setStartDate(startDate);
                setEndDate(endDate);
              },
              startDate: startDate || undefined,
              endDate: endDate || undefined,
            });
          }}
        >
          {startDate && endDate
            ? `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d')}`
            : 'Date range'}
        </Button>
        <OverviewFilterButton enableEventsFilter />
        <OverviewFiltersButtons className="justify-end p-0" />
      </div>
      <DataTableViewOptions table={table} />
    </DataTableToolbarContainer>
  );
}
