import { Checkbox } from '@/components/ui/checkbox';
import { useFormatDateInterval } from '@/hooks/use-format-date-interval';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useSelector } from '@/redux';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import type { ColumnDef, Header, Row } from '@tanstack/react-table';
import {
  type ExpandedState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  type VirtualItem,
  useVirtualizer,
  useWindowVirtualizer,
} from '@tanstack/react-virtual';
import throttle from 'lodash.throttle';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Tooltiper } from '@/components/ui/tooltip';
import { ReportTableToolbar } from './report-table-toolbar';
import {
  type ExpandableTableRow,
  type GroupedItem,
  type GroupedTableRow,
  type TableRow,
  groupsToExpandableRows,
  groupsToTableRows,
  transformToHierarchicalGroups,
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

interface VirtualRowProps {
  row: Row<TableRow | GroupedTableRow>;
  virtualRow: VirtualItem;
  pinningStylesMap: Map<string, React.CSSProperties>;
  headers: Header<TableRow | GroupedTableRow, unknown>[];
  isResizingRef: React.MutableRefObject<boolean>;
  resizingColumnId: string | null;
  setResizingColumnId: (id: string | null) => void;
  // Horizontal virtualization props
  leftPinnedColumns: Header<TableRow | GroupedTableRow, unknown>['column'][];
  scrollableColumns: Header<TableRow | GroupedTableRow, unknown>['column'][];
  rightPinnedColumns: Header<TableRow | GroupedTableRow, unknown>['column'][];
  virtualColumns: VirtualItem[];
  leftPinnedWidth: number;
  scrollableColumnsTotalWidth: number;
  rightPinnedWidth: number;
}

const VirtualRow = function VirtualRow({
  row,
  virtualRow,
  pinningStylesMap,
  headers,
  isResizingRef,
  resizingColumnId,
  setResizingColumnId,
  leftPinnedColumns,
  scrollableColumns,
  rightPinnedColumns,
  virtualColumns,
  leftPinnedWidth,
  scrollableColumnsTotalWidth,
  rightPinnedWidth,
}: VirtualRowProps) {
  const cells = row.getVisibleCells();

  const renderCell = (
    column: Header<TableRow | GroupedTableRow, unknown>['column'],
    header: Header<TableRow | GroupedTableRow, unknown> | undefined,
  ) => {
    const cell = cells.find((c) => c.column.id === column.id);
    if (!cell || !header) return null;

    const isBreakdown = column.columnDef.meta?.isBreakdown ?? false;
    const pinningStyles = pinningStylesMap.get(column.id) ?? {};
    const canResize = column.getCanResize();
    const isPinned = column.columnDef.meta?.pinned === 'left';
    const isResizing = resizingColumnId === column.id;

    return (
      <div
        key={cell.id}
        style={{
          width: `${header.getSize()}px`,
          minWidth: column.columnDef.minSize,
          maxWidth: column.columnDef.maxSize,
          ...pinningStyles,
        }}
        className={cn('relative overflow-hidden border-r')}
      >
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
        {canResize && isPinned && (
          <div
            data-resize-handle
            onMouseDown={(e) => {
              e.stopPropagation();
              isResizingRef.current = true;
              setResizingColumnId(column.id);
              header.getResizeHandler()(e);
            }}
            onMouseUp={() => {
              setTimeout(() => {
                isResizingRef.current = false;
                setResizingColumnId(null);
              }, 0);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              isResizingRef.current = true;
              setResizingColumnId(column.id);
              header.getResizeHandler()(e);
            }}
            onTouchEnd={() => {
              setTimeout(() => {
                isResizingRef.current = false;
                setResizingColumnId(null);
              }, 0);
            }}
            className={cn(
              'absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none select-none bg-transparent hover:bg-primary/50 transition-colors',
              isResizing && 'bg-primary',
            )}
          />
        )}
      </div>
    );
  };

  return (
    <div
      key={virtualRow.key}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: leftPinnedWidth + scrollableColumnsTotalWidth + rightPinnedWidth,
        height: `${virtualRow.size}px`,
        transform: `translateY(${virtualRow.start}px)`,
        display: 'flex',
        minWidth: 'fit-content',
      }}
      className="border-b hover:bg-muted/30 transition-colors"
    >
      {/* Left Pinned Columns */}
      {leftPinnedColumns.map((column) => {
        const header = headers.find((h) => h.column.id === column.id);
        return renderCell(column, header);
      })}

      {/* Scrollable Columns (Virtualized) */}
      <div
        style={{
          position: 'relative',
          width: scrollableColumnsTotalWidth,
          height: `${virtualRow.size}px`,
        }}
      >
        {virtualColumns.map((virtualCol) => {
          const column = scrollableColumns[virtualCol.index];
          if (!column) return null;
          const header = headers.find((h) => h.column.id === column.id);
          const cell = cells.find((c) => c.column.id === column.id);
          if (!cell || !header) return null;

          return (
            <div
              key={cell.id}
              style={{
                position: 'absolute',
                left: `${virtualCol.start}px`,
                width: `${virtualCol.size}px`,
                height: `${virtualRow.size}px`,
              }}
              className={cn('relative overflow-hidden')}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </div>
          );
        })}
      </div>

      {/* Right Pinned Columns */}
      {rightPinnedColumns.map((column) => {
        const header = headers.find((h) => h.column.id === column.id);
        return renderCell(column, header);
      })}
    </div>
  );
};

export function ReportTable({
  data,
  visibleSeries,
  setVisibleSeries,
}: ReportTableProps) {
  const [grouped, setGrouped] = useState(false);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});
  const [resizingColumnId, setResizingColumnId] = useState<string | null>(null);
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

  // Transform data to hierarchical groups or flat rows
  const {
    groups: hierarchicalGroups,
    rows: flatRows,
    dates,
    breakdownPropertyNames,
  } = useMemo(() => {
    if (grouped) {
      const result = transformToHierarchicalGroups(data, breakdowns);
      return {
        groups: result.groups,
        rows: null,
        dates: result.dates,
        breakdownPropertyNames: result.breakdownPropertyNames,
      };
    }
    const result = transformToTableData(data, breakdowns, false);
    return {
      groups: null,
      rows: result.rows as TableRow[],
      dates: result.dates,
      breakdownPropertyNames: result.breakdownPropertyNames,
    };
  }, [data, breakdowns, grouped]);

  // Convert hierarchical groups to expandable rows (for TanStack Table's expanding feature)
  const expandableRows = useMemo(() => {
    if (!grouped || !hierarchicalGroups || hierarchicalGroups.length === 0) {
      return null;
    }

    return groupsToExpandableRows(
      hierarchicalGroups,
      breakdownPropertyNames.length,
    );
  }, [grouped, hierarchicalGroups, breakdownPropertyNames.length]);

  // Use expandable rows if available, otherwise use flat rows
  const rows = expandableRows ?? flatRows ?? [];

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
        const metrics = ['count', 'sum', 'average', 'min', 'max'] as const;
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

    // Apply sorting - if grouped, always sort groups by highest count, then sort within each group
    if (grouped && result.length > 0) {
      const groupedRows = result as ExpandableTableRow[] | GroupedTableRow[];

      // Sort function based on current sort state
      const sortFn = (
        a: ExpandableTableRow | GroupedTableRow | TableRow,
        b: ExpandableTableRow | GroupedTableRow | TableRow,
      ) => {
        // If no sorting is selected, return 0 (no change)
        if (sorting.length === 0) return 0;

        for (const sort of sorting) {
          const { id, desc } = sort;
          let aValue: any;
          let bValue: any;

          if (id === 'serie-name') {
            aValue = a.serieName ?? '';
            bValue = b.serieName ?? '';
          } else if (id.startsWith('breakdown-')) {
            const index = Number.parseInt(id.replace('breakdown-', ''), 10);
            if ('breakdownDisplay' in a && a.breakdownDisplay) {
              aValue = a.breakdownDisplay[index] ?? '';
            } else {
              aValue = a.breakdownValues[index] ?? '';
            }
            if ('breakdownDisplay' in b && b.breakdownDisplay) {
              bValue = b.breakdownDisplay[index] ?? '';
            } else {
              bValue = b.breakdownValues[index] ?? '';
            }
          } else if (id.startsWith('metric-')) {
            const metric = id.replace('metric-', '') as keyof TableRow;
            aValue = a[metric] ?? 0;
            bValue = b[metric] ?? 0;
          } else if (id.startsWith('date-')) {
            const date = id.replace('date-', '');
            aValue = a.dateValues[date] ?? 0;
            bValue = b.dateValues[date] ?? 0;
          } else {
            continue;
          }

          // Handle null/undefined values
          if (aValue == null && bValue == null) continue;
          if (aValue == null) return 1;
          if (bValue == null) return -1;

          // Compare values
          if (typeof aValue === 'string' && typeof bValue === 'string') {
            const comparison = aValue.localeCompare(bValue);
            if (comparison !== 0) return desc ? -comparison : comparison;
          } else {
            if (aValue < bValue) return desc ? 1 : -1;
            if (aValue > bValue) return desc ? -1 : 1;
          }
        }
        return 0;
      };

      // For expandable rows, we need to sort recursively
      function sortExpandableRows(
        rows: ExpandableTableRow[],
        isTopLevel = true,
      ): ExpandableTableRow[] {
        // Sort rows: groups by count first (only at top level), then apply user sort
        const sorted = [...rows].sort((a, b) => {
          // At top level, sort groups by count first
          if (isTopLevel) {
            const aIsGroupHeader = 'isGroupHeader' in a && a.isGroupHeader;
            const bIsGroupHeader = 'isGroupHeader' in b && b.isGroupHeader;

            if (aIsGroupHeader && bIsGroupHeader) {
              const aLevel = 'groupLevel' in a ? (a.groupLevel ?? -1) : -1;
              const bLevel = 'groupLevel' in b ? (b.groupLevel ?? -1) : -1;

              // Same level groups: sort by count first (always, regardless of user sort)
              if (aLevel === bLevel) {
                const aCount = a.count ?? 0;
                const bCount = b.count ?? 0;
                if (aCount !== bCount) {
                  return bCount - aCount; // Highest first
                }
                // If counts are equal, fall through to user sort
              }
            }
          }

          // Apply user's sort criteria (for all rows, including within groups)
          return sortFn(a, b);
        });

        // Sort subRows recursively (within each group) - these are NOT top level
        return sorted.map((row) => {
          if ('subRows' in row && row.subRows) {
            return {
              ...row,
              subRows: sortExpandableRows(row.subRows, false),
            };
          }
          return row;
        });
      }

      return sortExpandableRows(groupedRows as ExpandableTableRow[]);
    }

    // For flat mode, apply sorting
    if (!grouped && result.length > 0 && sorting.length > 0) {
      return [...result].sort((a, b) => {
        for (const sort of sorting) {
          const { id, desc } = sort;
          let aValue: any;
          let bValue: any;

          if (id === 'serie-name') {
            aValue = a.serieName ?? '';
            bValue = b.serieName ?? '';
          } else if (id.startsWith('breakdown-')) {
            const index = Number.parseInt(id.replace('breakdown-', ''), 10);
            aValue = a.breakdownValues[index] ?? '';
            bValue = b.breakdownValues[index] ?? '';
          } else if (id.startsWith('metric-')) {
            const metric = id.replace('metric-', '') as keyof TableRow;
            aValue = a[metric] ?? 0;
            bValue = b[metric] ?? 0;
          } else if (id.startsWith('date-')) {
            const date = id.replace('date-', '');
            aValue = a.dateValues[date] ?? 0;
            bValue = b.dateValues[date] ?? 0;
          } else {
            continue;
          }

          // Handle null/undefined values
          if (aValue == null && bValue == null) continue;
          if (aValue == null) return 1;
          if (bValue == null) return -1;

          // Compare values
          if (typeof aValue === 'string' && typeof bValue === 'string') {
            const comparison = aValue.localeCompare(bValue);
            if (comparison !== 0) return desc ? -comparison : comparison;
          } else {
            if (aValue < bValue) return desc ? 1 : -1;
            if (aValue > bValue) return desc ? -1 : 1;
          }
        }
        return 0;
      });
    }

    return result;
  }, [rows, globalFilter, grouped, sorting]);

  // Calculate min/max values for color visualization
  const { metricRanges, dateRanges } = useMemo(() => {
    const metricRanges: Record<string, { min: number; max: number }> = {
      count: {
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY,
      },
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

    // Helper function to flatten expandable rows and get only individual rows
    function getIndividualRows(
      rows: (ExpandableTableRow | TableRow)[],
    ): TableRow[] {
      const individualRows: TableRow[] = [];
      for (const row of rows) {
        const isGroupHeader =
          'isGroupHeader' in row && row.isGroupHeader === true;
        const isSummary = 'isSummaryRow' in row && row.isSummaryRow === true;

        if (!isGroupHeader && !isSummary) {
          // It's an individual row - add it
          individualRows.push(row as TableRow);
        }

        // Always recursively process subRows if they exist (regardless of whether this is a group header)
        if ('subRows' in row && row.subRows && Array.isArray(row.subRows)) {
          individualRows.push(...getIndividualRows(row.subRows));
        }
      }
      return individualRows;
    }

    // Get only individual rows from all rows to ensure consistent ranges
    const individualRows = getIndividualRows(rows);
    const isSingleSeries = individualRows.length === 1;

    if (isSingleSeries) {
      // For single series, calculate ranges from date values
      const singleRow = individualRows[0]!;
      const allDateValues = dates.map(
        (date) => singleRow.dateValues[date] ?? 0,
      );
      const dateMin = Math.min(...allDateValues);
      const dateMax = Math.max(...allDateValues);

      // For date columns, use the range across all dates
      dates.forEach((date) => {
        dateRanges[date] = {
          min: dateMin,
          max: dateMax,
        };
      });

      // For metric columns, use date values to create meaningful ranges
      // This ensures we can still show color variation even with one series
      metricRanges.count = { min: dateMin, max: dateMax };
      metricRanges.sum = { min: dateMin, max: dateMax };
      metricRanges.average = { min: dateMin, max: dateMax };
      metricRanges.min = { min: dateMin, max: dateMax };
      metricRanges.max = { min: dateMin, max: dateMax };
    } else {
      // Multiple series: calculate ranges across individual rows only
      if (individualRows.length === 0) {
        // No individual rows found - this shouldn't happen, but handle gracefully
      } else {
        individualRows.forEach((row) => {
          // Calculate metric ranges
          Object.keys(metricRanges).forEach((key) => {
            const value = row[key as keyof typeof row] as number;
            if (typeof value === 'number' && !Number.isNaN(value)) {
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
            if (typeof value === 'number' && !Number.isNaN(value)) {
              dateRanges[date]!.min = Math.min(dateRanges[date]!.min, value);
              dateRanges[date]!.max = Math.max(dateRanges[date]!.max, value);
            }
          });
        });
      }
    }

    return { metricRanges, dateRanges };
  }, [rows, dates]);

  // Helper to get background color style and opacity for a value
  // Returns both style and opacity (for text color calculation) to avoid parsing
  const getCellBackgroundStyle = (
    value: number,
    min: number,
    max: number,
    colorClass: 'purple' | 'emerald' = 'emerald',
  ): { style: React.CSSProperties; opacity: number } => {
    if (value === 0) {
      return { style: {}, opacity: 0 };
    }

    // If min equals max (e.g. single row or all values same), show moderate opacity
    let opacity: number;
    if (max === min) {
      opacity = 0.5;
    } else {
      const percentage = (value - min) / (max - min);
      opacity = Math.max(0.05, Math.min(1, percentage));
    }

    // Use rgba colors directly instead of opacity + background class
    const backgroundColor =
      colorClass === 'purple'
        ? `rgba(168, 85, 247, ${opacity})` // purple-500
        : `rgba(16, 185, 129, ${opacity})`; // emerald-500

    return {
      style: { backgroundColor },
      opacity,
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

  // Create a hash of visibleSeriesIds to track checkbox state changes
  const visibleSeriesIdsHash = useMemo(() => {
    return visibleSeriesIds.sort().join(',');
  }, [visibleSeriesIds]);

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

  // Toggle group collapse (now handled by TanStack Table's expanding feature)
  // This is kept for backward compatibility with header click handlers
  const toggleGroupCollapse = (groupKey: string) => {
    // This will be handled by TanStack Table's row expansion
    // We can find the row by groupKey and toggle it
    // For now, this is a no-op as TanStack Table handles it
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
        const original = row.original;
        const serieName = original.serieName;
        const serieId = original.serieId;
        const isVisible = visibleSeriesIds.includes(serieId);
        const serieIndex = getSerieIndex(serieId);
        const color = getChartColor(serieIndex);

        // Check if this serie name matches the first row in the group (for muted styling)
        let isMuted = false;
        let isFirstRowInGroup = false;
        if (
          grouped &&
          'groupKey' in original &&
          original.groupKey &&
          !original.isSummaryRow
        ) {
          // Find all rows in this group from the current rows array
          const groupRows = rows.filter(
            (r): r is GroupedTableRow =>
              'groupKey' in r &&
              r.groupKey === original.groupKey &&
              !r.isSummaryRow,
          );

          if (groupRows.length > 0) {
            const firstRowInGroup = groupRows[0]!;

            // Check if this is the first row in the group
            if (firstRowInGroup.id === original.id) {
              isFirstRowInGroup = true;
            } else {
              isMuted = true;
            }
          }
        }

        const originalRow = row.original as ExpandableTableRow | TableRow;
        const isGroupHeader =
          'isGroupHeader' in originalRow && originalRow.isGroupHeader === true;
        const isExpanded = grouped ? (row.getIsExpanded?.() ?? false) : false;
        const isSerieGroupHeader =
          isGroupHeader &&
          'groupLevel' in originalRow &&
          originalRow.groupLevel === -1;
        const hasSubRows =
          'subRows' in originalRow && (originalRow.subRows?.length ?? 0) > 0;
        const isExpandable = grouped && isSerieGroupHeader && hasSubRows;

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
            <SerieName
              name={serieName}
              className={cn(
                'truncate',
                !isExpandable && grouped && 'text-muted-foreground/40',
                isExpandable && 'font-semibold',
              )}
            />
            {isExpandable && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  // Toggle expanded state manually
                  setExpanded((prev) => {
                    const newExpanded: ExpandedState =
                      typeof prev === 'object' ? { ...prev } : {};
                    const rowId = row.id;
                    newExpanded[rowId] = !newExpanded[rowId];
                    return newExpanded;
                  });
                }}
                className="cursor-pointer hover:opacity-70"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            )}
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

          // Find all rows at this breakdown level that can be expanded
          const rowsAtLevel: string[] = [];
          if (grouped && expandableRows) {
            function collectRowIdsAtLevel(
              rows: ExpandableTableRow[],
              targetLevel: number,
              currentLevel = 0,
            ): void {
              for (const row of rows) {
                if (
                  row.isGroupHeader &&
                  row.groupLevel === targetLevel &&
                  (row.subRows?.length ?? 0) > 0
                ) {
                  rowsAtLevel.push(row.id);
                }
                // Recurse into subRows if we haven't reached target level yet
                if (currentLevel < targetLevel && row.subRows) {
                  collectRowIdsAtLevel(
                    row.subRows,
                    targetLevel,
                    currentLevel + 1,
                  );
                }
              }
            }
            collectRowIdsAtLevel(expandableRows, index);
          }

          // Check if all groups at this level are expanded
          const allExpanded =
            rowsAtLevel.length > 0 &&
            rowsAtLevel.every(
              (id) => typeof expanded === 'object' && expanded[id] === true,
            );

          return (
            <div
              className="flex items-center gap-2 cursor-pointer hover:opacity-70"
              onClick={() => {
                if (!grouped) return;
                // Toggle all groups at this breakdown level
                setExpanded((prev) => {
                  const newExpanded: ExpandedState =
                    typeof prev === 'object' ? { ...prev } : {};
                  const shouldExpand = !allExpanded;
                  rowsAtLevel.forEach((id) => {
                    newExpanded[id] = shouldExpand;
                  });
                  return newExpanded;
                });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (!grouped) return;
                  setExpanded((prev) => {
                    const newExpanded: ExpandedState =
                      typeof prev === 'object' ? { ...prev } : {};
                    const shouldExpand = !allExpanded;
                    rowsAtLevel.forEach((id) => {
                      newExpanded[id] = shouldExpand;
                    });
                    return newExpanded;
                  });
                }
              }}
              role="button"
              tabIndex={0}
            >
              <span>{propertyName}</span>
            </div>
          );
        },
        meta: {
          pinned: 'left',
          isBreakdown: true,
        },
        cell: ({ row }) => {
          const original = row.original as ExpandableTableRow | TableRow;
          const isGroupHeader =
            'isGroupHeader' in original && original.isGroupHeader === true;
          const canExpand = row.getCanExpand?.() ?? false;
          const isExpanded = row.getIsExpanded?.() ?? false;

          const value: string | number | null =
            original.breakdownValues[index] ?? null;
          const isLastBreakdown = index === breakdownPropertyNames.length - 1;
          const isMuted = (!isLastBreakdown && !canExpand && grouped) || !value;

          // For group headers, only show value at the group level, hide deeper breakdowns
          if (isGroupHeader && 'groupLevel' in original) {
            const groupLevel = original.groupLevel ?? 0;
            if (index !== groupLevel) {
              return <div className="flex items-center gap-2 px-4 h-12" />;
            }
          }

          return (
            <div className="flex items-center gap-2 px-4 h-12">
              <span
                className={cn(
                  'truncate block leading-[48px]',
                  isMuted && 'text-muted-foreground/50',
                  isGroupHeader && 'font-semibold',
                )}
              >
                {value || '(Not set)'}
              </span>
              {canExpand &&
                index ===
                  ('groupLevel' in original ? (original.groupLevel ?? 0) : 0) &&
                index < breakdownPropertyNames.length - 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const handler = row.getToggleExpandedHandler();
                      if (handler) handler();
                    }}
                    className="cursor-pointer hover:opacity-70"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                )}
            </div>
          );
        },
      });
    });

    // Metric columns
    const metrics = [
      { key: 'count', label: 'Unique' },
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
          const original = row.original as ExpandableTableRow | TableRow;
          const hasIsSummaryRow = 'isSummaryRow' in original;
          const hasIsGroupHeader = 'isGroupHeader' in original;
          const isSummary = hasIsSummaryRow && original.isSummaryRow === true;
          const isGroupHeader =
            hasIsGroupHeader && original.isGroupHeader === true;
          const isIndividualRow = !isSummary && !isGroupHeader;
          const range = metricRanges[metric.key];

          // Only apply colors to individual rows, not summary or group header rows
          // Also check that range is valid (not still at initial values)
          const hasValidRange =
            range &&
            range.min !== Number.POSITIVE_INFINITY &&
            range.max !== Number.NEGATIVE_INFINITY;

          const { style: backgroundStyle, opacity: bgOpacity } =
            isIndividualRow && hasValidRange
              ? getCellBackgroundStyle(value, range.min, range.max, 'purple')
              : { style: {}, opacity: 0 };

          return (
            <div
              className={cn(
                'h-12 w-full text-right font-mono text-sm px-4 flex items-center justify-end',
                '[text-shadow:_0_0_3px_rgb(0_0_0_/_20%)] shadow-[inset_-1px_-1px_0_var(--border)]',
                (isSummary || isGroupHeader) && 'font-semibold',
              )}
              style={backgroundStyle}
            >
              {number.format(value)}
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
          const isGroupHeader =
            'isGroupHeader' in row.original &&
            row.original.isGroupHeader === true;
          const isIndividualRow = !isSummary && !isGroupHeader;
          const range = dateRanges[date];
          // Only apply colors to individual rows, not summary or group header rows
          // Also check that range is valid (not still at initial values)
          const hasValidRange =
            range &&
            range.min !== Number.POSITIVE_INFINITY &&
            range.max !== Number.NEGATIVE_INFINITY;
          const { style: backgroundStyle, opacity: bgOpacity } =
            isIndividualRow && hasValidRange
              ? getCellBackgroundStyle(value, range.min, range.max, 'emerald')
              : { style: {}, opacity: 0 };

          const needsLightText = bgOpacity > 0.7;

          return (
            <div
              className={cn(
                'h-12 w-full text-right font-mono text-sm px-4 flex items-center justify-end',
                '[text-shadow:_0_0_3px_rgb(0_0_0_/_20%)] shadow-[inset_-1px_-1px_0_var(--border)]',
                (isSummary || isGroupHeader) && 'font-semibold',
              )}
              style={backgroundStyle}
            >
              {number.format(value)}
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
    expandableRows,
    rows,
    metricRanges,
    dateRanges,
    columnSizing,
    expanded,
  ]);

  // Create a hash of column IDs to track when columns change
  const columnsHash = useMemo(() => {
    return columns.map((col) => col.id).join(',');
  }, [columns]);

  // Memoize table options to ensure table updates when filteredRows changes
  const tableOptions = useMemo(
    () => ({
      data: filteredRows, // This is already sorted in filteredRows
      columns,
      getCoreRowModel: getCoreRowModel(),
      getExpandedRowModel: grouped ? getExpandedRowModel() : undefined,
      getSubRows: grouped
        ? (row: ExpandableTableRow | TableRow) =>
            'subRows' in row ? row.subRows : undefined
        : undefined,
      // Sorting is handled manually in filteredRows, so we don't use getSortedRowModel
      getFilteredRowModel: getFilteredRowModel(),
      filterFns: {
        isWithinRange: () => true,
      },
      enableColumnResizing: true,
      columnResizeMode: 'onChange' as const,
      getRowCanExpand: grouped
        ? (row: any) => {
            const r = row.original as ExpandableTableRow;
            if (!('isGroupHeader' in r) || !r.isGroupHeader) return false;
            // Don't allow expansion for the last breakdown level
            const groupLevel = r.groupLevel ?? -1;
            const isLastBreakdown =
              groupLevel === breakdownPropertyNames.length - 1;
            const hasSubRows = (r.subRows?.length ?? 0) > 0;
            return !isLastBreakdown && hasSubRows;
          }
        : undefined,
      state: {
        sorting, // Keep sorting state for UI indicators
        columnSizing,
        expanded: grouped ? expanded : undefined,
      },
      onSortingChange: setSorting,
      onColumnSizingChange: setColumnSizing,
      onExpandedChange: grouped ? setExpanded : undefined,
      globalFilterFn: () => true, // We handle filtering manually
      manualSorting: true, // We handle sorting manually for both modes
      manualFiltering: true, // We handle filtering manually
    }),
    [
      filteredRows,
      columns,
      grouped,
      breakdownPropertyNames.length,
      sorting,
      columnSizing,
      expanded,
      setSorting,
      setColumnSizing,
      setExpanded,
    ],
  );

  const table = useReactTable(tableOptions);

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
          setResizingColumnId(null);
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

  // Get the row model to use (expanded when grouped, regular otherwise)
  // filteredRows is already sorted, so getExpandedRowModel/getRowModel should preserve that order
  // We need to recalculate when filteredRows changes to ensure sorting is applied
  const rowModelToUse = useMemo(() => {
    if (grouped) {
      return table.getExpandedRowModel();
    }
    return table.getRowModel();
  }, [table, grouped, expanded, filteredRows.length, sorting]);

  const virtualizer = useWindowVirtualizer({
    count: rowModelToUse.rows.length,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    scrollMargin,
  });

  const virtualRows = virtualizer.getVirtualItems();

  // Get visible columns in order
  const headerColumns = table
    .getAllLeafColumns()
    .filter((col) => table.getState().columnVisibility[col.id] !== false);

  // Separate columns into pinned and scrollable
  const leftPinnedColumns = headerColumns.filter(
    (col) => col.columnDef.meta?.pinned === 'left',
  );
  const rightPinnedColumns = headerColumns.filter(
    (col) => col.columnDef.meta?.pinned === 'right',
  );
  const scrollableColumns = headerColumns.filter(
    (col) => !col.columnDef.meta?.pinned,
  );

  // Calculate widths for virtualization
  const leftPinnedWidth = useMemo(
    () => leftPinnedColumns.reduce((sum, col) => sum + col.getSize(), 0),
    [leftPinnedColumns, columnSizing],
  );
  const rightPinnedWidth = useMemo(
    () => rightPinnedColumns.reduce((sum, col) => sum + col.getSize(), 0),
    [rightPinnedColumns, columnSizing],
  );
  const scrollableColumnsTotalWidth = useMemo(
    () => scrollableColumns.reduce((sum, col) => sum + col.getSize(), 0),
    [scrollableColumns, columnSizing],
  );

  // Horizontal virtualization for scrollable columns
  // Only virtualize if we have enough columns to benefit from it
  const shouldVirtualizeHorizontal = scrollableColumns.length > 10;

  const horizontalVirtualizer = useVirtualizer({
    count: scrollableColumns.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) =>
      scrollableColumns[index]?.getSize() ?? DEFAULT_COLUMN_WIDTH,
    horizontal: true,
    overscan: shouldVirtualizeHorizontal ? 5 : scrollableColumns.length,
  });

  // Get virtual columns - if not virtualizing, return all columns
  const virtualColumns = shouldVirtualizeHorizontal
    ? horizontalVirtualizer.getVirtualItems()
    : scrollableColumns.map((col, index) => ({
        index,
        start: scrollableColumns
          .slice(0, index)
          .reduce((sum, c) => sum + c.getSize(), 0),
        size: col.getSize(),
        key: col.id,
        end: 0,
        lane: 0,
      }));

  // Pre-compute grid template columns string and headers
  const { gridTemplateColumns, headers } = useMemo(() => {
    const headerGroups = table.getHeaderGroups();
    const firstGroupHeaders = headerGroups[0]?.headers ?? [];
    return {
      gridTemplateColumns:
        firstGroupHeaders.map((h) => `${h.getSize()}px`).join(' ') ?? '',
      headers: firstGroupHeaders,
    };
  }, [table, columnSizing, columnsHash]);

  // Pre-compute pinning styles for all columns
  const pinningStylesMap = useMemo(() => {
    const stylesMap = new Map<string, React.CSSProperties>();
    const headerGroups = table.getHeaderGroups();

    headerGroups.forEach((group) => {
      group.headers.forEach((header) => {
        const column = header.column;
        const isPinned = column.columnDef.meta?.pinned;
        if (!isPinned) {
          stylesMap.set(column.id, {});
          return;
        }

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

        stylesMap.set(column.id, {
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
        });
      });
    });

    return stylesMap;
  }, [table, leftPinnedColumns, rightPinnedColumns, columnSizing, columnsHash]);

  // Helper to get pinning styles (for backward compatibility with header)
  const getPinningStyles = (
    column: ReturnType<typeof table.getColumn> | undefined,
  ) => {
    if (!column) return {};
    return pinningStylesMap.get(column.id) ?? {};
  };

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col border rounded-lg overflow-hidden bg-card mt-8">
      <ReportTableToolbar
        grouped={grouped}
        onToggleGrouped={
          !breakdowns || breakdowns.length === 0
            ? undefined
            : () => setGrouped(!grouped)
        }
        search={globalFilter}
        onSearchChange={setGlobalFilter}
        onUnselectAll={() => setVisibleSeries([])}
      />
      <div
        ref={parentRef}
        className="overflow-x-auto"
        style={{
          width: '100%',
        }}
      >
        <div
          className="relative"
          style={{
            width:
              leftPinnedWidth + scrollableColumnsTotalWidth + rightPinnedWidth,
            minWidth: 'fit-content',
          }}
        >
          {/* Header */}
          <div
            className="sticky top-0 z-20 bg-card border-b"
            style={{
              display: 'flex',
              width:
                leftPinnedWidth +
                scrollableColumnsTotalWidth +
                rightPinnedWidth,
              minWidth: 'fit-content',
            }}
          >
            {/* Left Pinned Columns */}
            {leftPinnedColumns.map((column) => {
              const header = headers.find((h) => h.column.id === column.id);
              if (!header) return null;
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
                        setResizingColumnId(column.id);
                        header.getResizeHandler()(e);
                      }}
                      onMouseUp={() => {
                        // Use setTimeout to allow the resize to complete before resetting
                        setTimeout(() => {
                          isResizingRef.current = false;
                          setResizingColumnId(null);
                        }, 0);
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        isResizingRef.current = true;
                        setResizingColumnId(column.id);
                        header.getResizeHandler()(e);
                      }}
                      onTouchEnd={() => {
                        setTimeout(() => {
                          isResizingRef.current = false;
                          setResizingColumnId(null);
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

            {/* Scrollable Columns (Virtualized) */}
            <div
              style={{
                position: 'relative',
                width: scrollableColumnsTotalWidth,
                height: '40px',
              }}
            >
              {virtualColumns.map((virtualCol) => {
                const column = scrollableColumns[virtualCol.index];
                if (!column) return null;
                const header = headers.find((h) => h.column.id === column.id);
                if (!header) return null;

                const headerContent = header.column.columnDef.header;
                const isBreakdown =
                  header.column.columnDef.meta?.isBreakdown ?? false;
                const isMetricOrDate =
                  header.column.id.startsWith('metric-') ||
                  header.column.id.startsWith('date-');
                const canSort = header.column.getCanSort();
                const isSorted = header.column.getIsSorted();

                return (
                  <div
                    key={header.id}
                    style={{
                      position: 'absolute',
                      left: `${virtualCol.start}px`,
                      width: `${virtualCol.size}px`,
                      height: '40px',
                    }}
                    className={cn(
                      'px-4 flex items-center text-[10px] uppercase font-semibold bg-muted/30 border-r border-border whitespace-nowrap',
                      isMetricOrDate && 'text-right',
                      canSort && 'cursor-pointer hover:bg-muted/50 select-none',
                    )}
                    onClick={
                      canSort
                        ? (e) => {
                            if (
                              isResizingRef.current ||
                              header.column.getIsResizing() ||
                              (e.target as HTMLElement).closest(
                                '[data-resize-handle]',
                              )
                            ) {
                              return;
                            }
                            header.column.toggleSorting();
                          }
                        : undefined
                    }
                    onKeyDown={
                      canSort
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              header.column.toggleSorting();
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
                  </div>
                );
              })}
            </div>

            {/* Right Pinned Columns */}
            {rightPinnedColumns.map((column) => {
              const header = headers.find((h) => h.column.id === column.id);
              if (!header) return null;

              const headerContent = header.column.columnDef.header;
              const isBreakdown =
                header.column.columnDef.meta?.isBreakdown ?? false;
              const pinningStyles = getPinningStyles(header.column);
              const isMetricOrDate =
                header.column.id.startsWith('metric-') ||
                header.column.id.startsWith('date-');
              const canSort = header.column.getCanSort();
              const isSorted = header.column.getIsSorted();
              const canResize = header.column.getCanResize();

              return (
                <div
                  key={header.id}
                  style={{
                    width: `${header.getSize()}px`,
                    minWidth: header.column.columnDef.minSize,
                    maxWidth: header.column.columnDef.maxSize,
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
                          if (
                            isResizingRef.current ||
                            header.column.getIsResizing() ||
                            (e.target as HTMLElement).closest(
                              '[data-resize-handle]',
                            )
                          ) {
                            return;
                          }
                          header.column.toggleSorting();
                        }
                      : undefined
                  }
                  onKeyDown={
                    canSort
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            header.column.toggleSorting();
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
              const tableRow = rowModelToUse.rows[virtualRow.index];
              if (!tableRow) return null;

              return (
                <VirtualRow
                  key={`${virtualRow.key}-${gridTemplateColumns}`}
                  row={tableRow}
                  virtualRow={{
                    ...virtualRow,
                    start: virtualRow.start - virtualizer.options.scrollMargin,
                  }}
                  pinningStylesMap={pinningStylesMap}
                  headers={headers}
                  isResizingRef={isResizingRef}
                  resizingColumnId={resizingColumnId}
                  setResizingColumnId={setResizingColumnId}
                  leftPinnedColumns={leftPinnedColumns}
                  scrollableColumns={scrollableColumns}
                  rightPinnedColumns={rightPinnedColumns}
                  virtualColumns={virtualColumns}
                  leftPinnedWidth={leftPinnedWidth}
                  scrollableColumnsTotalWidth={scrollableColumnsTotalWidth}
                  rightPinnedWidth={rightPinnedWidth}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
