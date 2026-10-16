import {
  type ColumnDef,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  type Row as TableRow,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  DownloadIcon,
  SearchIcon,
  XIcon,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_IDENTITY_WIDTH,
  type ReportColumn,
  type ReportRowIdentity,
} from './columns';
import { buildCsv, downloadCsv } from './csv';
import { isNumericFormat, useCellFormatter } from './format';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/cn';

export const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 32;
const MAX_TABLE_HEIGHT = 600;
// Below this many rows the DOM is small enough to render whole.
const VIRTUALIZE_FROM = 40;
const VIRTUAL_OVERSCAN = 8;
const HEAT_MIN_OPACITY = 0.06;
// Strong enough to read as a scale, light enough that the number on top stays legible.
const HEAT_MAX_OPACITY = 0.4;

interface ReportDataTableProps<Row> {
  rows: Row[];
  columns: ReportColumn<Row>[];
  identity: ReportRowIdentity<Row>;
  getRowId: (row: Row) => string;
  /** Rows the chart currently draws; with `onToggleRow` each row gets a checkbox. */
  selectedIds?: ReadonlySet<string>;
  onToggleRow?: (id: string) => void;
  onUnselectAll?: () => void;
  /** Enables the "Download CSV" button, named after this. */
  csvFilename?: string;
  searchable?: boolean;
  className?: string;
}

interface ColumnRange {
  min: number;
  max: number;
}

export function ReportDataTable<Row>({
  rows,
  columns,
  identity,
  getRowId,
  selectedIds,
  onToggleRow,
  onUnselectAll,
  csvFilename,
  searchable = true,
  className,
}: ReportDataTableProps<Row>) {
  const formatCell = useCellFormatter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const ranges = useMemo(() => columnRanges(rows, columns), [rows, columns]);
  const searchedRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return rows;
    }
    return rows.filter((row) =>
      identity.searchText(row).toLowerCase().includes(needle)
    );
  }, [rows, search, identity]);

  const columnDefs = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: 'identity',
        accessorFn: (row) => identity.searchText(row),
        enableSorting: true,
        sortingFn: 'alphanumeric',
      },
      ...columns.map(
        (column): ColumnDef<Row> => ({
          id: column.id,
          accessorFn: (row) => column.value(row) ?? null,
          enableSorting: column.sortable !== false,
          sortUndefined: 'last',
          sortingFn: isNumericFormat(column.format) ? 'basic' : 'alphanumeric',
        })
      ),
    ],
    [columns, identity]
  );

  const table = useReactTable({
    data: searchedRows,
    columns: columnDefs,
    state: { sorting },
    // `src/types/data-table.ts` makes this filter mandatory on every table; rows are searched before they get here.
    filterFns: { isWithinRange: () => true },
    onSortingChange: setSorting,
    getRowId: (row) => getRowId(row),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const tableRows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: VIRTUAL_OVERSCAN,
    enabled: tableRows.length > VIRTUALIZE_FROM,
  });
  const isVirtual = tableRows.length > VIRTUALIZE_FROM;
  const virtualRows = isVirtual ? virtualizer.getVirtualItems() : null;

  const identityWidth = identity.width ?? DEFAULT_IDENTITY_WIDTH;
  const totalWidth =
    identityWidth +
    columns.reduce(
      (sum, column) => sum + (column.width ?? DEFAULT_COLUMN_WIDTH),
      0
    );

  const renderRow = (row: TableRow<Row>, style?: React.CSSProperties) => {
    const id = row.id;
    const isSelected = selectedIds?.has(id) ?? true;
    const color = identity.color?.(row.original);
    return (
      <div
        className={cn(
          'group/row flex border-border border-b transition-colors hover:bg-def-100',
          !isSelected && 'opacity-50'
        )}
        key={id}
        style={{ height: ROW_HEIGHT, minWidth: totalWidth, ...style }}
      >
        <div
          className="sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-card px-3 group-hover/row:bg-def-100"
          style={{ width: identityWidth }}
        >
          {onToggleRow && (
            <Checkbox
              aria-label={`Show ${identity.searchText(row.original)}`}
              checked={isSelected}
              onCheckedChange={() => onToggleRow(id)}
            />
          )}
          {color && (
            <span
              className="h-5 w-[3px] shrink-0 rounded-full"
              style={{ background: color }}
            />
          )}
          <div className="min-w-0 flex-1 truncate">
            {identity.render(row.original)}
          </div>
        </div>
        {columns.map((column) => (
          <Cell
            column={column}
            formatted={formatCell(column.value(row.original), column.format)}
            key={column.id}
            range={ranges.get(column.id)}
            row={row.original}
          />
        ))}
      </div>
    );
  };

  return (
    <div className={cn('col', className)} data-report-table>
      <Toolbar
        onDownload={
          csvFilename
            ? () =>
                downloadCsv(
                  csvFilename,
                  buildCsv(
                    tableRows.map((row) => row.original),
                    identity,
                    columns
                  )
                )
            : undefined
        }
        onSearch={searchable ? setSearch : undefined}
        onUnselectAll={onUnselectAll}
        search={search}
      />
      <div
        className="relative overflow-auto"
        ref={scrollRef}
        style={{ maxHeight: MAX_TABLE_HEIGHT }}
      >
        <div
          className="sticky top-0 z-20 flex border-border border-b bg-card"
          style={{ height: HEADER_HEIGHT, minWidth: totalWidth }}
        >
          {table.getFlatHeaders().map((header) => {
            const column = columns.find((item) => item.id === header.id);
            const isIdentity = header.id === 'identity';
            const sorted = header.column.getIsSorted();
            const numeric = !isIdentity && isNumericFormat(column?.format);
            return (
              <button
                className={cn(
                  'flex shrink-0 items-center gap-1 px-3 font-medium text-muted-foreground text-sm hover:text-foreground',
                  numeric ? 'justify-end' : 'justify-start',
                  isIdentity && 'sticky left-0 z-10 bg-card'
                )}
                disabled={!header.column.getCanSort()}
                key={header.id}
                onClick={header.column.getToggleSortingHandler()}
                style={{
                  width: isIdentity
                    ? identityWidth
                    : (column?.width ?? DEFAULT_COLUMN_WIDTH),
                }}
                type="button"
              >
                <span className="truncate">
                  {isIdentity ? identity.header : column?.header}
                </span>
                <SortChevron direction={sorted || null} />
              </button>
            );
          })}
        </div>
        {tableRows.length === 0 && (
          <div className="flex h-20 items-center justify-center text-muted-foreground text-sm">
            No rows match
          </div>
        )}
        {virtualRows ? (
          <div
            className="relative"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualRows.map((virtualRow) =>
              renderRow(tableRows[virtualRow.index]!, {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${virtualRow.start}px)`,
              })
            )}
          </div>
        ) : (
          tableRows.map((row) => renderRow(row))
        )}
      </div>
    </div>
  );
}

function Cell<Row>({
  column,
  row,
  formatted,
  range,
}: {
  column: ReportColumn<Row>;
  row: Row;
  formatted: string;
  range: ColumnRange | undefined;
}) {
  const numeric = isNumericFormat(column.format);
  const raw = column.value(row);
  const share =
    column.decorate && range && typeof raw === 'number'
      ? decorationShare(raw, range, column.decorate)
      : null;
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center px-3',
        numeric && 'justify-end font-mono tabular-nums'
      )}
      style={{ width: column.width ?? DEFAULT_COLUMN_WIDTH }}
    >
      {share !== null && column.decorate === 'bar' && (
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 rounded-r bg-def-200 group-hover/row:bg-blue-200 dark:group-hover/row:bg-blue-900"
          style={{ width: `${share * 100}%` }}
        />
      )}
      {share !== null && column.decorate === 'heat' && (
        <span
          aria-hidden
          className="absolute inset-0 bg-chart-0"
          style={{
            opacity:
              HEAT_MIN_OPACITY + share * (HEAT_MAX_OPACITY - HEAT_MIN_OPACITY),
          }}
        />
      )}
      <span className="relative truncate">
        {column.render ? column.render(row, formatted) : formatted}
      </span>
    </div>
  );
}

function Toolbar({
  search,
  onSearch,
  onUnselectAll,
  onDownload,
}: {
  search: string;
  onSearch?: (value: string) => void;
  onUnselectAll?: () => void;
  onDownload?: () => void;
}) {
  if (!(onSearch || onUnselectAll || onDownload)) {
    return null;
  }
  return (
    <div className="flex items-center gap-2 border-border border-b p-2">
      {onSearch && (
        <div className="relative flex-1 md:max-w-xs">
          <SearchIcon className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search…"
            size="sm"
            value={search}
          />
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        {onUnselectAll && (
          <Button
            icon={XIcon}
            onClick={onUnselectAll}
            size="sm"
            variant="outline"
          >
            Unselect all
          </Button>
        )}
        {onDownload && (
          <Button
            icon={DownloadIcon}
            onClick={onDownload}
            size="sm"
            variant="outline"
          >
            CSV
          </Button>
        )}
      </div>
    </div>
  );
}

function SortChevron({ direction }: { direction: 'asc' | 'desc' | null }) {
  if (direction === 'desc') {
    return <ChevronDownIcon className="size-3 shrink-0" />;
  }
  if (direction === 'asc') {
    return <ChevronUpIcon className="size-3 shrink-0" />;
  }
  return <ChevronDownIcon className="size-3 shrink-0 opacity-0" />;
}

function columnRanges<Row>(rows: Row[], columns: ReportColumn<Row>[]) {
  const ranges = new Map<string, ColumnRange>();
  for (const column of columns) {
    if (!column.decorate) {
      continue;
    }
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of rows) {
      const value = column.value(row);
      if (typeof value === 'number') {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
    if (max > min || max > 0) {
      ranges.set(column.id, { min, max });
    }
  }
  return ranges;
}

/** A bar shows the share of the column's largest value; heat shows where the value sits between min and max. */
function decorationShare(
  value: number,
  range: ColumnRange,
  decoration: 'bar' | 'heat'
) {
  if (decoration === 'bar') {
    return range.max > 0 ? Math.max(0, value / range.max) : 0;
  }
  if (value <= 0) {
    return null;
  }
  const span = range.max - range.min;
  return span > 0 ? (value - range.min) / span : 1;
}

export type { ReportColumn, ReportRowIdentity } from './columns';
