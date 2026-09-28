import type { ColumnDef, Header, Row } from '@tanstack/react-table';
import {
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import {
  useVirtualizer,
  useWindowVirtualizer,
  type VirtualItem,
} from '@tanstack/react-virtual';
import throttle from 'lodash.throttle';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ReportTableToolbar } from './report-table-toolbar';
import {
  type ExpandableTableRow,
  type GroupedTableRow,
  groupsToExpandableRows,
  type TableRow,
  transformToHierarchicalGroups,
  transformToTableData,
} from './report-table-utils';
import { SerieName } from './serie-name';
import { Checkbox } from '@/components/ui/checkbox';
import { useFormatDateInterval } from '@/hooks/use-format-date-interval';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useSelector } from '@/redux';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

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
    header: Header<TableRow | GroupedTableRow, unknown> | undefined
  ) => {
    const cell = cells.find((c) => c.column.id === column.id);
    if (!(cell && header)) {
      return null;
    }

    const isBreakdown = column.columnDef.meta?.isBreakdown ?? false;
    const pinningStyles = pinningStylesMap.get(column.id) ?? {};
    const canResize = column.getCanResize();
    const isPinned = column.columnDef.meta?.pinned === 'left';
    const isResizing = resizingColumnId === column.id;

    return (
      <div
        className={cn('relative overflow-hidden border-r')}
        key={cell.id}
        style={{
          width: `${header.getSize()}px`,
          minWidth: column.columnDef.minSize,
          maxWidth: column.columnDef.maxSize,
          ...pinningStyles,
        }}
      >
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
        {canResize && isPinned && (
          <div
            className={cn(
              'absolute top-0 right-0 h-full w-1 cursor-col-resize touch-none select-none bg-transparent transition-colors hover:bg-primary/50',
              isResizing && 'bg-primary'
            )}
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
            onTouchEnd={() => {
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
          />
        )}
      </div>
    );
  };

  return (
    <div
      className="border-b transition-colors hover:bg-muted/30"
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
    >
      {leftPinnedColumns.map((column) => {
        const header = headers.find((h) => h.column.id === column.id);
        return renderCell(column, header);
      })}

      <div
        style={{
          position: 'relative',
          width: scrollableColumnsTotalWidth,
          height: `${virtualRow.size}px`,
        }}
      >
        {virtualColumns.map((virtualCol) => {
          const column = scrollableColumns[virtualCol.index];
          if (!column) {
            return null;
          }
          const header = headers.find((h) => h.column.id === column.id);
          const cell = cells.find((c) => c.column.id === column.id);
          if (!(cell && header)) {
            return null;
          }

          return (
            <div
              className={cn('relative overflow-hidden')}
              key={cell.id}
              style={{
                position: 'absolute',
                left: `${virtualCol.start}px`,
                width: `${virtualCol.size}px`,
                height: `${virtualRow.size}px`,
              }}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </div>
          );
        })}
      </div>

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

  const expandableRows = useMemo(() => {
    if (!(grouped && hierarchicalGroups) || hierarchicalGroups.length === 0) {
      return null;
    }

    return groupsToExpandableRows(
      hierarchicalGroups,
      breakdownPropertyNames.length
    );
  }, [grouped, hierarchicalGroups, breakdownPropertyNames.length]);

  const rows = expandableRows ?? flatRows ?? [];

  const filteredRows = useMemo(() => {
    let result = rows;

    if (globalFilter.trim()) {
      const searchLower = globalFilter.toLowerCase();
      result = rows.filter((row) => {
        if (row.serieName.toLowerCase().includes(searchLower)) {
          return true;
        }

        if (
          row.breakdownValues.some((val) =>
            val?.toLowerCase().includes(searchLower)
          )
        ) {
          return true;
        }

        const metrics = ['count', 'sum', 'average', 'min', 'max'] as const;
        if (
          metrics.some((metric) =>
            String(row[metric]).toLowerCase().includes(searchLower)
          )
        ) {
          return true;
        }

        if (
          Object.values(row.dateValues).some((val) =>
            String(val).toLowerCase().includes(searchLower)
          )
        ) {
          return true;
        }

        return false;
      });
    }

    if (grouped && result.length > 0) {
      const groupedRows = result as ExpandableTableRow[] | GroupedTableRow[];

      const sortFn = (
        a: ExpandableTableRow | GroupedTableRow | TableRow,
        b: ExpandableTableRow | GroupedTableRow | TableRow
      ) => {
        if (sorting.length === 0) {
          return 0;
        }

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

          if (aValue == null && bValue == null) {
            continue;
          }
          if (aValue == null) {
            return 1;
          }
          if (bValue == null) {
            return -1;
          }

          if (typeof aValue === 'string' && typeof bValue === 'string') {
            const comparison = aValue.localeCompare(bValue);
            if (comparison !== 0) {
              return desc ? -comparison : comparison;
            }
          } else {
            if (aValue < bValue) {
              return desc ? 1 : -1;
            }
            if (aValue > bValue) {
              return desc ? -1 : 1;
            }
          }
        }
        return 0;
      };

      function sortExpandableRows(
        rows: ExpandableTableRow[],
        isTopLevel = true
      ): ExpandableTableRow[] {
        const sorted = [...rows].sort((a, b) => {
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
                  return bCount - aCount;
                }
                // If counts are equal, fall through to user sort
              }
            }
          }

          return sortFn(a, b);
        });

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

          if (aValue == null && bValue == null) {
            continue;
          }
          if (aValue == null) {
            return 1;
          }
          if (bValue == null) {
            return -1;
          }

          if (typeof aValue === 'string' && typeof bValue === 'string') {
            const comparison = aValue.localeCompare(bValue);
            if (comparison !== 0) {
              return desc ? -comparison : comparison;
            }
          } else {
            if (aValue < bValue) {
              return desc ? 1 : -1;
            }
            if (aValue > bValue) {
              return desc ? -1 : 1;
            }
          }
        }
        return 0;
      });
    }

    return result;
  }, [rows, globalFilter, grouped, sorting]);

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

    function getIndividualRows(
      rows: (ExpandableTableRow | TableRow)[]
    ): TableRow[] {
      const individualRows: TableRow[] = [];
      for (const row of rows) {
        const isGroupHeader =
          'isGroupHeader' in row && row.isGroupHeader === true;
        const isSummary = 'isSummaryRow' in row && row.isSummaryRow === true;

        if (!(isGroupHeader || isSummary)) {
          individualRows.push(row as TableRow);
        }

        if ('subRows' in row && row.subRows && Array.isArray(row.subRows)) {
          individualRows.push(...getIndividualRows(row.subRows));
        }
      }
      return individualRows;
    }

    const individualRows = getIndividualRows(rows);
    const isSingleSeries = individualRows.length === 1;

    if (isSingleSeries) {
      const singleRow = individualRows[0]!;
      const allDateValues = dates.map(
        (date) => singleRow.dateValues[date] ?? 0
      );
      const dateMin = Math.min(...allDateValues);
      const dateMax = Math.max(...allDateValues);

      dates.forEach((date) => {
        dateRanges[date] = {
          min: dateMin,
          max: dateMax,
        };
      });

      metricRanges.count = { min: dateMin, max: dateMax };
      metricRanges.sum = { min: dateMin, max: dateMax };
      metricRanges.average = { min: dateMin, max: dateMax };
      metricRanges.min = { min: dateMin, max: dateMax };
      metricRanges.max = { min: dateMin, max: dateMax };
    } else if (individualRows.length === 0) {
    } else {
      individualRows.forEach((row) => {
        Object.keys(metricRanges).forEach((key) => {
          const value = row[key as keyof typeof row] as number;
          if (typeof value === 'number' && !Number.isNaN(value)) {
            metricRanges[key]!.min = Math.min(metricRanges[key]!.min, value);
            metricRanges[key]!.max = Math.max(metricRanges[key]!.max, value);
          }
        });

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

    return { metricRanges, dateRanges };
  }, [rows, dates]);

  // Returns both style and opacity (for text color calculation) to avoid parsing
  const getCellBackgroundStyle = (
    value: number,
    min: number,
    max: number,
    colorClass: 'purple' | 'emerald' = 'emerald'
  ): { style: React.CSSProperties; opacity: number } => {
    if (value === 0) {
      return { style: {}, opacity: 0 };
    }

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

  const visibleSeriesIds = useMemo(() => {
    if (visibleSeries.length === 0) {
      return [];
    }
    if (typeof visibleSeries[0] === 'string') {
      return visibleSeries as string[];
    }
    return (visibleSeries as IChartData['series']).map((s) => s.id);
  }, [visibleSeries]);

  const visibleSeriesIdsHash = useMemo(() => {
    return visibleSeriesIds.sort().join(',');
  }, [visibleSeriesIds]);

  const getSerieIndex = (serieId: string): number => {
    return data.series.findIndex((s) => s.id === serieId);
  };

  const toggleSerieVisibility = (serieId: string) => {
    setVisibleSeries((prev) => {
      if (prev.includes(serieId)) {
        return prev.filter((id) => id !== serieId);
      }
      return [...prev, serieId];
    });
  };

  const toggleGroupCollapse = (groupKey: string) => {
    // For now, this is a no-op as TanStack Table handles it
  };

  const columns = useMemo<ColumnDef<TableRow | GroupedTableRow>[]>(() => {
    const cols: ColumnDef<TableRow | GroupedTableRow>[] = [];

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
        const serieId = original.serieId;
        // Look up serie name directly from data to ensure we always have the latest value
        const serie = data.series.find((s) => s.id === serieId);
        const serieName = serie?.names[0] ?? original.serieName ?? '';
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
          const groupRows = rows.filter(
            (r): r is GroupedTableRow =>
              'groupKey' in r &&
              r.groupKey === original.groupKey &&
              !r.isSummaryRow
          );

          if (groupRows.length > 0) {
            const firstRowInGroup = groupRows[0]!;

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
          <div className="flex h-12 items-center gap-2 px-4">
            <Checkbox
              checked={isVisible}
              className="h-4 w-4 shrink-0"
              onCheckedChange={() => toggleSerieVisibility(serieId)}
              style={{
                borderColor: color,
                backgroundColor: isVisible ? color : 'transparent',
              }}
            />
            <SerieName
              className={cn(
                'truncate',
                !isExpandable && grouped && 'text-muted-foreground/40',
                isExpandable && 'font-semibold'
              )}
              name={serieName}
            />
            {isExpandable && (
              <button
                className="cursor-pointer hover:opacity-70"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setExpanded((prev) => {
                    const newExpanded: ExpandedState =
                      typeof prev === 'object' ? { ...prev } : {};
                    const rowId = row.id;
                    newExpanded[rowId] = !newExpanded[rowId];
                    return newExpanded;
                  });
                }}
                type="button"
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

          const rowsAtLevel: string[] = [];
          if (grouped && expandableRows) {
            function collectRowIdsAtLevel(
              rows: ExpandableTableRow[],
              targetLevel: number,
              currentLevel = 0
            ): void {
              for (const row of rows) {
                if (
                  row.isGroupHeader &&
                  row.groupLevel === targetLevel &&
                  (row.subRows?.length ?? 0) > 0
                ) {
                  rowsAtLevel.push(row.id);
                }
                if (currentLevel < targetLevel && row.subRows) {
                  collectRowIdsAtLevel(
                    row.subRows,
                    targetLevel,
                    currentLevel + 1
                  );
                }
              }
            }
            collectRowIdsAtLevel(expandableRows, index);
          }

          const allExpanded =
            rowsAtLevel.length > 0 &&
            rowsAtLevel.every(
              (id) => typeof expanded === 'object' && expanded[id] === true
            );

          return (
            <div
              className="flex cursor-pointer items-center gap-2 hover:opacity-70"
              onClick={() => {
                if (!grouped) {
                  return;
                }
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
                  if (!grouped) {
                    return;
                  }
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
          const isMuted =
            (!(isLastBreakdown || canExpand) && grouped) || !value;

          // For group headers, only show value at the group level, hide deeper breakdowns
          if (isGroupHeader && 'groupLevel' in original) {
            const groupLevel = original.groupLevel ?? 0;
            if (index !== groupLevel) {
              return <div className="flex h-12 items-center gap-2 px-4" />;
            }
          }

          return (
            <div className="flex h-12 items-center gap-2 px-4">
              <span
                className={cn(
                  'block truncate leading-[48px]',
                  isMuted && 'text-muted-foreground/50',
                  isGroupHeader && 'font-semibold'
                )}
              >
                {value || '(Not set)'}
              </span>
              {canExpand &&
                index ===
                  ('groupLevel' in original ? (original.groupLevel ?? 0) : 0) &&
                index < breakdownPropertyNames.length - 1 && (
                  <button
                    className="cursor-pointer hover:opacity-70"
                    onClick={(e) => {
                      e.stopPropagation();
                      const handler = row.getToggleExpandedHandler();
                      if (handler) {
                        handler();
                      }
                    }}
                    type="button"
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
          const isIndividualRow = !(isSummary || isGroupHeader);
          const range = metricRanges[metric.key];

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
                'flex h-12 w-full items-center justify-end px-4 text-right font-mono text-sm',
                'shadow-[inset_-1px_-1px_0_var(--border)] [text-shadow:_0_0_3px_rgb(0_0_0_/_20%)]',
                (isSummary || isGroupHeader) && 'font-semibold'
              )}
              style={backgroundStyle}
            >
              {number.format(value)}
            </div>
          );
        },
      });
    });

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
          const isIndividualRow = !(isSummary || isGroupHeader);
          const range = dateRanges[date];
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
                'flex h-12 w-full items-center justify-end px-4 text-right font-mono text-sm',
                'shadow-[inset_-1px_-1px_0_var(--border)] [text-shadow:_0_0_3px_rgb(0_0_0_/_20%)]',
                (isSummary || isGroupHeader) && 'font-semibold'
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
    data,
  ]);

  const columnsHash = useMemo(() => {
    return columns.map((col) => col.id).join(',');
  }, [columns]);

  const tableOptions = useMemo(
    () => ({
      data: filteredRows,
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
            if (!('isGroupHeader' in r && r.isGroupHeader)) {
              return false;
            }
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
      globalFilterFn: () => true,
      manualSorting: true,
      manualFiltering: true,
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
    ]
  );

  const table = useReactTable(tableOptions);

  useEffect(() => {
    const updateScrollMargin = throttle(() => {
      if (parentRef.current) {
        setScrollMargin(
          parentRef.current.getBoundingClientRect().top + window.scrollY
        );
      }
    }, 500);

    updateScrollMargin();
    window.addEventListener('resize', updateScrollMargin);

    return () => {
      window.removeEventListener('resize', updateScrollMargin);
    };
  }, []);

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

  // Always call the table helpers so React Table can manage its own memoization
  const rowModelToUse = grouped
    ? table.getExpandedRowModel()
    : table.getRowModel();

  const virtualizer = useWindowVirtualizer({
    count: rowModelToUse.rows.length,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    scrollMargin,
  });

  const virtualRows = virtualizer.getVirtualItems();

  const headerColumns = table
    .getAllLeafColumns()
    .filter((col) => table.getState().columnVisibility[col.id] !== false);

  const leftPinnedColumns = headerColumns.filter(
    (col) => col.columnDef.meta?.pinned === 'left'
  );
  const rightPinnedColumns = headerColumns.filter(
    (col) => col.columnDef.meta?.pinned === 'right'
  );
  const scrollableColumns = headerColumns.filter(
    (col) => !col.columnDef.meta?.pinned
  );

  const leftPinnedWidth = useMemo(
    () => leftPinnedColumns.reduce((sum, col) => sum + col.getSize(), 0),
    [leftPinnedColumns, columnSizing]
  );
  const rightPinnedWidth = useMemo(
    () => rightPinnedColumns.reduce((sum, col) => sum + col.getSize(), 0),
    [rightPinnedColumns, columnSizing]
  );
  const scrollableColumnsTotalWidth = useMemo(
    () => scrollableColumns.reduce((sum, col) => sum + col.getSize(), 0),
    [scrollableColumns, columnSizing]
  );

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

  const { gridTemplateColumns, headers } = useMemo(() => {
    const headerGroups = table.getHeaderGroups();
    const firstGroupHeaders = headerGroups[0]?.headers ?? [];
    return {
      gridTemplateColumns:
        firstGroupHeaders.map((h) => `${h.getSize()}px`).join(' ') ?? '',
      headers: firstGroupHeaders,
    };
  }, [table, columnSizing, columnsHash]);

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

  const getPinningStyles = (
    column: ReturnType<typeof table.getColumn> | undefined
  ) => {
    if (!column) {
      return {};
    }
    return pinningStylesMap.get(column.id) ?? {};
  };

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 flex flex-col overflow-hidden rounded-lg border bg-card">
      <ReportTableToolbar
        grouped={grouped}
        onSearchChange={setGlobalFilter}
        onToggleGrouped={
          !breakdowns || breakdowns.length === 0
            ? undefined
            : () => setGrouped(!grouped)
        }
        onUnselectAll={() => setVisibleSeries([])}
        search={globalFilter}
      />
      <div
        className="overflow-x-auto"
        ref={parentRef}
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
          <div
            className="sticky top-0 z-20 border-b bg-card"
            style={{
              display: 'flex',
              width:
                leftPinnedWidth +
                scrollableColumnsTotalWidth +
                rightPinnedWidth,
              minWidth: 'fit-content',
            }}
          >
            {leftPinnedColumns.map((column) => {
              const header = headers.find((h) => h.column.id === column.id);
              if (!header) {
                return null;
              }
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
                  className={cn(
                    'relative flex h-10 items-center whitespace-nowrap border-border border-r bg-muted/30 px-4 font-semibold text-[10px] uppercase',
                    isMetricOrDate && 'text-right',
                    canSort && 'cursor-pointer select-none hover:bg-muted/50'
                  )}
                  key={header.id}
                  onClick={
                    canSort
                      ? (e) => {
                          // Don't trigger sort if clicking on resize handle or if we just finished resizing
                          if (
                            isResizingRef.current ||
                            column.getIsResizing() ||
                            (e.target as HTMLElement).closest(
                              '[data-resize-handle]'
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
                  style={{
                    width: `${header.getSize()}px`,
                    minWidth: column.columnDef.minSize,
                    maxWidth: column.columnDef.maxSize,
                    ...pinningStyles,
                  }}
                  tabIndex={canSort ? 0 : undefined}
                >
                  <div className="flex flex-1 items-center gap-1.5">
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
                      className={cn(
                        'absolute top-0 right-0 h-full w-1 cursor-col-resize touch-none select-none bg-transparent transition-colors hover:bg-primary/50',
                        header.column.getIsResizing() && 'bg-primary'
                      )}
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
                      onTouchEnd={() => {
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
                    />
                  )}
                </div>
              );
            })}

            <div
              style={{
                position: 'relative',
                width: scrollableColumnsTotalWidth,
                height: '40px',
              }}
            >
              {virtualColumns.map((virtualCol) => {
                const column = scrollableColumns[virtualCol.index];
                if (!column) {
                  return null;
                }
                const header = headers.find((h) => h.column.id === column.id);
                if (!header) {
                  return null;
                }

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
                    className={cn(
                      'flex items-center whitespace-nowrap border-border border-r bg-muted/30 px-4 font-semibold text-[10px] uppercase',
                      isMetricOrDate && 'text-right',
                      canSort && 'cursor-pointer select-none hover:bg-muted/50'
                    )}
                    key={header.id}
                    onClick={
                      canSort
                        ? (e) => {
                            if (
                              isResizingRef.current ||
                              header.column.getIsResizing() ||
                              (e.target as HTMLElement).closest(
                                '[data-resize-handle]'
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
                    style={{
                      position: 'absolute',
                      left: `${virtualCol.start}px`,
                      width: `${virtualCol.size}px`,
                      height: '40px',
                    }}
                    tabIndex={canSort ? 0 : undefined}
                  >
                    <div className="flex flex-1 items-center gap-1.5">
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

            {rightPinnedColumns.map((column) => {
              const header = headers.find((h) => h.column.id === column.id);
              if (!header) {
                return null;
              }

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
                  className={cn(
                    'relative flex h-10 items-center whitespace-nowrap border-border border-r bg-muted/30 px-4 font-semibold text-[10px] uppercase',
                    isMetricOrDate && 'text-right',
                    canSort && 'cursor-pointer select-none hover:bg-muted/50'
                  )}
                  key={header.id}
                  onClick={
                    canSort
                      ? (e) => {
                          if (
                            isResizingRef.current ||
                            header.column.getIsResizing() ||
                            (e.target as HTMLElement).closest(
                              '[data-resize-handle]'
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
                  style={{
                    width: `${header.getSize()}px`,
                    minWidth: header.column.columnDef.minSize,
                    maxWidth: header.column.columnDef.maxSize,
                    ...pinningStyles,
                  }}
                  tabIndex={canSort ? 0 : undefined}
                >
                  <div className="flex flex-1 items-center gap-1.5">
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

          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: 'relative',
            }}
          >
            {virtualRows.map((virtualRow) => {
              const tableRow = rowModelToUse.rows[virtualRow.index];
              if (!tableRow) {
                return null;
              }

              // Include serie name in key to force re-render when name changes
              const serieId = tableRow.original.serieId;
              const serie = data.series.find((s) => s.id === serieId);
              const serieName =
                serie?.names[0] ?? tableRow.original.serieName ?? '';

              return (
                <VirtualRow
                  headers={headers}
                  isResizingRef={isResizingRef}
                  key={`${virtualRow.key}-${serieName}-${gridTemplateColumns}`}
                  leftPinnedColumns={leftPinnedColumns}
                  leftPinnedWidth={leftPinnedWidth}
                  pinningStylesMap={pinningStylesMap}
                  resizingColumnId={resizingColumnId}
                  rightPinnedColumns={rightPinnedColumns}
                  rightPinnedWidth={rightPinnedWidth}
                  row={tableRow}
                  scrollableColumns={scrollableColumns}
                  scrollableColumnsTotalWidth={scrollableColumnsTotalWidth}
                  setResizingColumnId={setResizingColumnId}
                  virtualColumns={virtualColumns}
                  virtualRow={{
                    ...virtualRow,
                    start: virtualRow.start - virtualizer.options.scrollMargin,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
