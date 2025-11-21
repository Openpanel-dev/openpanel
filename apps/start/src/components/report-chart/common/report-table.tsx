import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow as UITableRow,
} from '@/components/ui/table';
import { useFormatDateInterval } from '@/hooks/use-format-date-interval';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useSelector } from '@/redux';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import type { ColumnDef } from '@tanstack/react-table';
import {
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  type VirtualItem,
  useWindowVirtualizer,
} from '@tanstack/react-virtual';
import throttle from 'lodash.throttle';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';

import { ReportTableToolbar } from './report-table-toolbar';
import {
  type GroupedTableRow,
  type TableRow,
  createSummaryRow,
  transformToTableData,
} from './report-table-utils';
import { SerieName } from './serie-name';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    pinned?: 'left' | 'right';
    isBreakdown?: boolean;
    breakdownIndex?: number;
  }
}

interface ReportTableProps {
  data: IChartData;
  visibleSeries: IChartData['series'] | string[];
  setVisibleSeries: React.Dispatch<React.SetStateAction<string[]>>;
}

const DEFAULT_COLUMN_WIDTH = 150;
const ROW_HEIGHT = 48; // h-12

export function ReportTable({
  data,
  visibleSeries,
  setVisibleSeries,
}: ReportTableProps) {
  const [grouped, setGrouped] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});
  const isResizingRef = useRef(false);
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const number = useNumber();
  const interval = useSelector((state) => state.report.interval);
  const breakdowns = useSelector((state) => state.report.breakdowns);
  const formatDate = useFormatDateInterval({
    interval,
    short: true,
  });

  // Transform data to table format
  const {
    rows: rawRows,
    dates,
    breakdownPropertyNames,
  } = useMemo(
    () => transformToTableData(data, breakdowns, grouped),
    [data, breakdowns, grouped],
  );

  // Filter rows based on collapsed groups and create summary rows
  const rows = useMemo(() => {
    if (!grouped || collapsedGroups.size === 0) {
      return rawRows;
    }

    const processedRows: (TableRow | GroupedTableRow)[] = [];
    const groupedRows = rawRows as GroupedTableRow[];

    // Group rows by their groupKey
    const rowsByGroup = new Map<string, GroupedTableRow[]>();
    groupedRows.forEach((row) => {
      if (row.groupKey) {
        if (!rowsByGroup.has(row.groupKey)) {
          rowsByGroup.set(row.groupKey, []);
        }
        rowsByGroup.get(row.groupKey)!.push(row);
      } else {
        // Rows without groupKey go directly to processed
        processedRows.push(row);
      }
    });

    // Process each group
    rowsByGroup.forEach((groupRows, groupKey) => {
      if (collapsedGroups.has(groupKey)) {
        // Group is collapsed - show summary row
        const summaryRow = createSummaryRow(
          groupRows,
          groupKey,
          breakdownPropertyNames.length,
        );
        processedRows.push(summaryRow);
      } else {
        // Group is expanded - show all rows
        processedRows.push(...groupRows);
      }
    });

    return processedRows;
  }, [rawRows, collapsedGroups, grouped, breakdownPropertyNames.length]);

  // Filter rows based on global search and apply sorting
  const filteredRows = useMemo(() => {
    let result = rows;

    // Apply search filter
    if (globalFilter.trim()) {
      const searchLower = globalFilter.toLowerCase();
      result = rows.filter((row) => {
        // Search in serie name
        if (row.serieName.toLowerCase().includes(searchLower)) return true;

        // Search in breakdown values
        if (
          row.breakdownValues.some((val) =>
            val?.toLowerCase().includes(searchLower),
          )
        ) {
          return true;
        }

        // Search in metric values
        const metrics = ['sum', 'average', 'min', 'max'] as const;
        if (
          metrics.some((metric) =>
            String(row[metric]).toLowerCase().includes(searchLower),
          )
        ) {
          return true;
        }

        // Search in date values
        if (
          Object.values(row.dateValues).some((val) =>
            String(val).toLowerCase().includes(searchLower),
          )
        ) {
          return true;
        }

        return false;
      });
    }

    // Apply sorting - if grouped, sort within each group
    if (grouped && sorting.length > 0 && result.length > 0) {
      const groupedRows = result as GroupedTableRow[];

      // Group rows by their groupKey
      const rowsByGroup = new Map<string, GroupedTableRow[]>();
      const ungroupedRows: GroupedTableRow[] = [];

      groupedRows.forEach((row) => {
        if (row.groupKey) {
          if (!rowsByGroup.has(row.groupKey)) {
            rowsByGroup.set(row.groupKey, []);
          }
          rowsByGroup.get(row.groupKey)!.push(row);
        } else {
          ungroupedRows.push(row);
        }
      });

      // Sort function based on current sort state
      const sortFn = (a: GroupedTableRow, b: GroupedTableRow) => {
        for (const sort of sorting) {
          const { id, desc } = sort;
          let aValue: any;
          let bValue: any;

          if (id === 'serie-name') {
            aValue = a.serieName;
            bValue = b.serieName;
          } else if (id.startsWith('breakdown-')) {
            const index = Number.parseInt(id.replace('breakdown-', ''), 10);
            aValue = a.breakdownValues[index] ?? '';
            bValue = b.breakdownValues[index] ?? '';
          } else if (id.startsWith('metric-')) {
            const metric = id.replace('metric-', '') as keyof TableRow;
            aValue = a[metric];
            bValue = b[metric];
          } else if (id.startsWith('date-')) {
            const date = id.replace('date-', '');
            aValue = a.dateValues[date] ?? 0;
            bValue = b.dateValues[date] ?? 0;
          } else {
            continue;
          }

          // Compare values
          if (aValue < bValue) return desc ? 1 : -1;
          if (aValue > bValue) return desc ? -1 : 1;
        }
        return 0;
      };

      // Sort groups themselves by their first row's sort value
      const groupsArray = Array.from(rowsByGroup.entries());
      groupsArray.sort((a, b) => {
        const aFirst = a[1][0];
        const bFirst = b[1][0];
        if (!aFirst || !bFirst) return 0;
        return sortFn(aFirst, bFirst);
      });

      // Rebuild result with sorted groups
      const finalResult: GroupedTableRow[] = [];
      groupsArray.forEach(([, groupRows]) => {
        const sorted = [...groupRows].sort(sortFn);
        finalResult.push(...sorted);
      });
      finalResult.push(...ungroupedRows.sort(sortFn));

      return finalResult;
    }

    return result;
  }, [rows, globalFilter, grouped, sorting]);

  // Calculate min/max values for color visualization
  const { metricRanges, dateRanges } = useMemo(() => {
    const metricRanges: Record<string, { min: number; max: number }> = {
      sum: { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
      average: {
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY,
      },
      min: { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
      max: { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
    };

    const dateRanges: Record<string, { min: number; max: number }> = {};
    dates.forEach((date) => {
      dateRanges[date] = {
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY,
      };
    });

    rows.forEach((row) => {
      // Calculate metric ranges
      Object.keys(metricRanges).forEach((key) => {
        const value = row[key as keyof typeof row] as number;
        if (typeof value === 'number') {
          metricRanges[key]!.min = Math.min(metricRanges[key]!.min, value);
          metricRanges[key]!.max = Math.max(metricRanges[key]!.max, value);
        }
      });

      // Calculate date ranges
      dates.forEach((date) => {
        const value = row.dateValues[date] ?? 0;
        if (!dateRanges[date]) {
          dateRanges[date] = {
            min: Number.POSITIVE_INFINITY,
            max: Number.NEGATIVE_INFINITY,
          };
        }
        dateRanges[date]!.min = Math.min(dateRanges[date]!.min, value);
        dateRanges[date]!.max = Math.max(dateRanges[date]!.max, value);
      });
    });

    return { metricRanges, dateRanges };
  }, [rows, dates]);

  // Helper to get background color and opacity for a value
  const getCellBackground = (
    value: number,
    min: number,
    max: number,
  ): { opacity: number; className: string } => {
    if (value === 0 || max === min) {
      return { opacity: 0, className: '' };
    }

    const percentage = (value - min) / (max - min);
    const opacity = Math.max(0.05, Math.min(1, percentage));

    return {
      opacity,
      className: 'bg-highlight dark:bg-emerald-700',
    };
  };

  // Normalize visibleSeries to string array
  const visibleSeriesIds = useMemo(() => {
    if (visibleSeries.length === 0) return [];
    if (typeof visibleSeries[0] === 'string') {
      return visibleSeries as string[];
    }
    return (visibleSeries as IChartData['series']).map((s) => s.id);
  }, [visibleSeries]);

  // Get serie index for color
  const getSerieIndex = (serieId: string): number => {
    return data.series.findIndex((s) => s.id === serieId);
  };

  // Toggle serie visibility
  const toggleSerieVisibility = (serieId: string) => {
    setVisibleSeries((prev) => {
      if (prev.includes(serieId)) {
        return prev.filter((id) => id !== serieId);
      }
      return [...prev, serieId];
    });
  };

  // Toggle group collapse
  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  // Define columns
  const columns = useMemo<ColumnDef<TableRow | GroupedTableRow>[]>(() => {
    const cols: ColumnDef<TableRow | GroupedTableRow>[] = [];

    // Serie name column (pinned left) with checkbox
    cols.push({
      id: 'serie-name',
      header: 'Serie',
      accessorKey: 'serieName',
      enableSorting: true,
      size: DEFAULT_COLUMN_WIDTH,
      meta: {
        pinned: 'left',
      },
      cell: ({ row }) => {
        const serieName = row.original.serieName;
        const serieId = row.original.originalSerie.id;
        const isVisible = visibleSeriesIds.includes(serieId);
        const serieIndex = getSerieIndex(serieId);
        const color = getChartColor(serieIndex);

        return (
          <div className="flex items-center gap-2 px-4 h-12">
            <Checkbox
              checked={isVisible}
              onCheckedChange={() => toggleSerieVisibility(serieId)}
              style={{
                borderColor: color,
                backgroundColor: isVisible ? color : 'transparent',
              }}
              className="h-4 w-4 shrink-0"
            />
            <SerieName name={serieName} className="truncate" />
          </div>
        );
      },
    });

    // Breakdown columns (pinned left, collapsible)
    breakdownPropertyNames.forEach((propertyName, index) => {
      const isLastBreakdown = index === breakdownPropertyNames.length - 1;
      const isCollapsible = grouped && !isLastBreakdown;

      cols.push({
        id: `breakdown-${index}`,
        enableSorting: true,
        enableResizing: true,
        size: columnSizing[`breakdown-${index}`] ?? DEFAULT_COLUMN_WIDTH,
        minSize: 100,
        maxSize: 500,
        accessorFn: (row) => {
          if ('breakdownDisplay' in row && grouped) {
            return row.breakdownDisplay[index] ?? '';
          }
          return row.breakdownValues[index] ?? '';
        },
        header: ({ column }) => {
          if (!isCollapsible) {
            return propertyName;
          }

          // Find all unique group keys for this breakdown level
          const groupKeys = new Set<string>();
          (rawRows as GroupedTableRow[]).forEach((row) => {
            if (row.groupKey) {
              groupKeys.add(row.groupKey);
            }
          });

          // Check if all groups at this level are collapsed
          const allCollapsed = Array.from(groupKeys).every((key) =>
            collapsedGroups.has(key),
          );

          return (
            <div
              className="flex items-center gap-2 cursor-pointer hover:opacity-70"
              onClick={() => {
                // Toggle all groups at this breakdown level
                groupKeys.forEach((key) => toggleGroupCollapse(key));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  groupKeys.forEach((key) => toggleGroupCollapse(key));
                }
              }}
              role="button"
              tabIndex={0}
            >
              {allCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              <span>{propertyName}</span>
            </div>
          );
        },
        meta: {
          pinned: 'left',
          isBreakdown: true,
          breakdownIndex: index,
        },
        cell: ({ row }) => {
          const original = row.original;
          let value: string | null;

          if ('breakdownDisplay' in original && grouped) {
            value = original.breakdownDisplay[index] ?? null;
          } else {
            value = original.breakdownValues[index] ?? null;
          }

          const isSummary = original.isSummaryRow ?? false;

          return (
            <span
              className={cn(
                'truncate block leading-[48px] px-4',
                !value && 'text-muted-foreground',
                isSummary && 'font-semibold',
              )}
            >
              {value || ''}
            </span>
          );
        },
      });
    });

    // Metric columns
    const metrics = [
      { key: 'sum', label: 'Sum' },
      { key: 'average', label: 'Average' },
      { key: 'min', label: 'Min' },
      { key: 'max', label: 'Max' },
    ] as const;

    metrics.forEach((metric) => {
      cols.push({
        id: `metric-${metric.key}`,
        header: metric.label,
        accessorKey: metric.key,
        enableSorting: true,
        size: 100,
        cell: ({ row }) => {
          const value = row.original[metric.key];
          const isSummary = row.original.isSummaryRow ?? false;
          const range = metricRanges[metric.key];
          const { opacity, className } = range
            ? getCellBackground(value, range.min, range.max)
            : { opacity: 0, className: '' };

          return (
            <div className="relative h-12 w-full">
              <div
                className={cn(className, 'absolute inset-0 w-full h-full')}
                style={{ opacity }}
              />
              <div
                className={cn(
                  'relative text-right font-mono text-sm px-4 h-full flex items-center justify-end',
                  isSummary && 'font-semibold',
                  opacity > 0.7 &&
                    'text-white [text-shadow:_0_0_3px_rgb(0_0_0_/_20%)]',
                )}
              >
                {number.format(value)}
              </div>
            </div>
          );
        },
      });
    });

    // Date columns
    dates.forEach((date) => {
      cols.push({
        id: `date-${date}`,
        header: formatDate(date),
        accessorFn: (row) => row.dateValues[date] ?? 0,
        enableSorting: true,
        size: 100,
        cell: ({ row }) => {
          const value = row.original.dateValues[date] ?? 0;
          const isSummary = row.original.isSummaryRow ?? false;
          const range = dateRanges[date];
          const { opacity, className } = range
            ? getCellBackground(value, range.min, range.max)
            : { opacity: 0, className: '' };

          return (
            <div className="relative h-12 w-full">
              <div
                className={cn(className, 'absolute inset-0 w-full h-full')}
                style={{ opacity }}
              />
              <div
                className={cn(
                  'relative text-right font-mono text-sm px-4 h-full flex items-center justify-end',
                  isSummary && 'font-semibold',
                  opacity > 0.7 &&
                    'text-white [text-shadow:_0_0_3px_rgb(0_0_0_/_20%)]',
                )}
              >
                {number.format(value)}
              </div>
            </div>
          );
        },
      });
    });

    return cols;
  }, [
    breakdownPropertyNames,
    dates,
    formatDate,
    number,
    grouped,
    visibleSeriesIds,
    collapsedGroups,
    rawRows,
    metricRanges,
    dateRanges,
    columnSizing,
  ]);

  const table = useReactTable({
    data: filteredRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: grouped ? getCoreRowModel() : getSortedRowModel(), // Disable TanStack sorting when grouped
    getFilteredRowModel: getFilteredRowModel(),
    filterFns: {
      isWithinRange: () => true,
    },
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    state: {
      sorting,
      columnSizing,
    },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    globalFilterFn: () => true, // We handle filtering manually
    manualSorting: grouped, // Manual sorting when grouped
  });

  // Virtualization setup
  useEffect(() => {
    const updateScrollMargin = throttle(() => {
      if (parentRef.current) {
        setScrollMargin(
          parentRef.current.getBoundingClientRect().top + window.scrollY,
        );
      }
    }, 500);

    updateScrollMargin();
    window.addEventListener('resize', updateScrollMargin);

    return () => {
      window.removeEventListener('resize', updateScrollMargin);
    };
  }, []);

  // Handle global mouseup to reset resize flag
  useEffect(() => {
    const handleMouseUp = () => {
      if (isResizingRef.current) {
        // Small delay to ensure resize handlers complete
        setTimeout(() => {
          isResizingRef.current = false;
        }, 100);
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: filteredRows.length,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    scrollMargin,
  });

  const virtualRows = virtualizer.getVirtualItems();

  // Get visible columns in order
  const headerColumns = table
    .getAllLeafColumns()
    .filter((col) => table.getState().columnVisibility[col.id] !== false);

  // Get pinned columns
  const leftPinnedColumns = table
    .getAllColumns()
    .filter((col) => col.columnDef.meta?.pinned === 'left')
    .filter((col): col is NonNullable<typeof col> => col !== undefined);
  const rightPinnedColumns = table
    .getAllColumns()
    .filter((col) => col.columnDef.meta?.pinned === 'right')
    .filter((col): col is NonNullable<typeof col> => col !== undefined);

  // Helper to get pinning styles
  const getPinningStyles = (
    column: ReturnType<typeof table.getColumn> | undefined,
  ) => {
    if (!column) return {};
    const isPinned = column.columnDef.meta?.pinned;
    if (!isPinned) return {};

    const pinnedColumns =
      isPinned === 'left' ? leftPinnedColumns : rightPinnedColumns;
    const columnIndex = pinnedColumns.findIndex((c) => c.id === column.id);
    const isLastPinned =
      columnIndex === pinnedColumns.length - 1 && isPinned === 'left';
    const isFirstRightPinned = columnIndex === 0 && isPinned === 'right';

    let left = 0;
    if (isPinned === 'left') {
      for (let i = 0; i < columnIndex; i++) {
        left += pinnedColumns[i]!.getSize();
      }
    }

    return {
      position: 'sticky' as const,
      left: isPinned === 'left' ? `${left}px` : undefined,
      right: isPinned === 'right' ? '0px' : undefined,
      zIndex: 10,
      backgroundColor: 'var(--card)',
      boxShadow: isLastPinned
        ? '-4px 0 4px -4px var(--border) inset'
        : isFirstRightPinned
          ? '4px 0 4px -4px var(--border) inset'
          : undefined,
    };
  };

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col border rounded-lg overflow-hidden bg-card mt-8">
      <ReportTableToolbar
        grouped={grouped}
        onToggleGrouped={() => setGrouped(!grouped)}
        search={globalFilter}
        onSearchChange={setGlobalFilter}
        onUnselectAll={() => setVisibleSeries([])}
      />
      <div ref={parentRef} className="overflow-x-auto">
        <div className="relative" style={{ minWidth: 'fit-content' }}>
          {/* Header */}
          <div
            className="sticky top-0 z-20 bg-card border-b"
            style={{
              display: 'grid',
              gridTemplateColumns:
                table
                  .getHeaderGroups()[0]
                  ?.headers.map((h) => `${h.getSize()}px`)
                  .join(' ') ?? '',
              minWidth: 'fit-content',
            }}
          >
            {table.getHeaderGroups()[0]?.headers.map((header) => {
              const column = header.column;
              const headerContent = column.columnDef.header;
              const isBreakdown = column.columnDef.meta?.isBreakdown ?? false;
              const pinningStyles = getPinningStyles(column);
              const isMetricOrDate =
                column.id.startsWith('metric-') ||
                column.id.startsWith('date-');

              const canSort = column.getCanSort();
              const isSorted = column.getIsSorted();
              const canResize = column.getCanResize();
              const isPinned = column.columnDef.meta?.pinned === 'left';

              return (
                <div
                  key={header.id}
                  style={{
                    width: `${header.getSize()}px`,
                    minWidth: column.columnDef.minSize,
                    maxWidth: column.columnDef.maxSize,
                    ...pinningStyles,
                  }}
                  className={cn(
                    'h-10 px-4 flex items-center text-[10px] uppercase font-semibold bg-muted/30 border-r border-border whitespace-nowrap relative',
                    isMetricOrDate && 'text-right',
                    canSort && 'cursor-pointer hover:bg-muted/50 select-none',
                  )}
                  onClick={
                    canSort
                      ? (e) => {
                          // Don't trigger sort if clicking on resize handle or if we just finished resizing
                          if (
                            isResizingRef.current ||
                            column.getIsResizing() ||
                            (e.target as HTMLElement).closest(
                              '[data-resize-handle]',
                            )
                          ) {
                            return;
                          }
                          column.toggleSorting();
                        }
                      : undefined
                  }
                  onKeyDown={
                    canSort
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            column.toggleSorting();
                          }
                        }
                      : undefined
                  }
                  role={canSort ? 'button' : undefined}
                  tabIndex={canSort ? 0 : undefined}
                >
                  <div className="flex items-center gap-1.5 flex-1">
                    {header.isPlaceholder
                      ? null
                      : typeof headerContent === 'function'
                        ? flexRender(headerContent, header.getContext())
                        : headerContent}
                    {canSort && (
                      <span className="text-muted-foreground">
                        {isSorted === 'asc'
                          ? '↑'
                          : isSorted === 'desc'
                            ? '↓'
                            : '⇅'}
                      </span>
                    )}
                  </div>
                  {canResize && isPinned && (
                    <div
                      data-resize-handle
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        isResizingRef.current = true;
                        header.getResizeHandler()(e);
                      }}
                      onMouseUp={() => {
                        // Use setTimeout to allow the resize to complete before resetting
                        setTimeout(() => {
                          isResizingRef.current = false;
                        }, 0);
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        isResizingRef.current = true;
                        header.getResizeHandler()(e);
                      }}
                      onTouchEnd={() => {
                        setTimeout(() => {
                          isResizingRef.current = false;
                        }, 0);
                      }}
                      className={cn(
                        'absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none select-none bg-transparent hover:bg-primary/50 transition-colors',
                        header.column.getIsResizing() && 'bg-primary',
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Virtualized Body */}
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: 'relative',
            }}
          >
            {virtualRows.map((virtualRow) => {
              const tableRow = table.getRowModel().rows[virtualRow.index];
              if (!tableRow) return null;

              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${
                      virtualRow.start - virtualizer.options.scrollMargin
                    }px)`,
                    display: 'grid',
                    gridTemplateColumns:
                      table
                        .getHeaderGroups()[0]
                        ?.headers.map((h) => `${h.getSize()}px`)
                        .join(' ') ?? '',
                    minWidth: 'fit-content',
                  }}
                  className="border-b hover:bg-muted/30 transition-colors"
                >
                  {table.getHeaderGroups()[0]?.headers.map((header) => {
                    const column = header.column;
                    const cell = tableRow
                      .getVisibleCells()
                      .find((c) => c.column.id === column.id);
                    if (!cell) return null;

                    const isBreakdown =
                      column.columnDef.meta?.isBreakdown ?? false;
                    const pinningStyles = getPinningStyles(column);
                    const isMetricOrDate =
                      column.id.startsWith('metric-') ||
                      column.id.startsWith('date-');

                    const canResize = column.getCanResize();
                    const isPinned = column.columnDef.meta?.pinned === 'left';

                    return (
                      <div
                        key={cell.id}
                        style={{
                          width: `${header.getSize()}px`,
                          minWidth: column.columnDef.minSize,
                          maxWidth: column.columnDef.maxSize,
                          ...pinningStyles,
                        }}
                        className={cn(
                          'border-r border-border relative overflow-hidden',
                          isBreakdown && 'border-r-2',
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                        {canResize && isPinned && (
                          <div
                            data-resize-handle
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              isResizingRef.current = true;
                              header.getResizeHandler()(e);
                            }}
                            onMouseUp={() => {
                              setTimeout(() => {
                                isResizingRef.current = false;
                              }, 0);
                            }}
                            onTouchStart={(e) => {
                              e.stopPropagation();
                              isResizingRef.current = true;
                              header.getResizeHandler()(e);
                            }}
                            onTouchEnd={() => {
                              setTimeout(() => {
                                isResizingRef.current = false;
                              }, 0);
                            }}
                            className={cn(
                              'absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none select-none bg-transparent hover:bg-primary/50 transition-colors',
                              column.getIsResizing() && 'bg-primary',
                            )}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
