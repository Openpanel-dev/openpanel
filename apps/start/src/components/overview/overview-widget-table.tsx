import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useNumber } from '@/hooks/use-numer-formatter';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { ChevronDown, ChevronUp, ExternalLinkIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Skeleton } from '../skeleton';
import { Tooltiper } from '../ui/tooltip';
import { WidgetTable, type Props as WidgetTableProps } from '../widget-table';

function RevenuePieChart({ percentage }: { percentage: number }) {
  const size = 16;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - percentage * circumference;

  return (
    <svg width={size} height={size} className="flex-shrink-0">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-def-200"
      />
      {/* Revenue arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#3ba974"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all"
      />
    </svg>
  );
}

function SortableHeader({
  name,
  isSorted,
  sortDirection,
  onClick,
  isRightAligned,
}: {
  name: string;
  isSorted: boolean;
  sortDirection: 'asc' | 'desc' | null;
  onClick: () => void;
  isRightAligned?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'row items-center gap-1 hover:opacity-80 transition-opacity',
        isRightAligned && 'justify-end ml-auto',
      )}
    >
      <span>{name}</span>
      {isSorted ? (
        sortDirection === 'desc' ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronUp className="size-3" />
        )
      ) : (
        <ChevronDown className="size-3 opacity-30" />
      )}
    </button>
  );
}

type Props<T> = WidgetTableProps<T> & {
  getColumnPercentage: (item: T) => number;
};

export const OverviewWidgetTable = <T,>({
  data,
  keyExtractor,
  columns,
  getColumnPercentage,
  className,
}: Props<T>) => {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(
    null,
  );

  // Handle column header click for sorting
  const handleSort = (columnName: string) => {
    if (sortColumn === columnName) {
      // Cycle through: desc -> asc -> null
      if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else if (sortDirection === 'asc') {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      // First click on a column = descending (highest to lowest)
      setSortColumn(columnName);
      setSortDirection('desc');
    }
  };

  // Sort data based on current sort state
  // Sort all available items, then limit display to top 15
  const sortedData = useMemo(() => {
    const allData = data ?? [];

    if (!sortColumn || !sortDirection) {
      // When not sorting, return top 15 (maintain original behavior)
      return allData;
    }

    const column = columns.find((col) => {
      if (typeof col.name === 'string') {
        return col.name === sortColumn;
      }
      return false;
    });

    if (!column?.getSortValue) {
      return allData;
    }

    // Sort all available items
    const sorted = [...allData].sort((a, b) => {
      const aValue = column.getSortValue!(a);
      const bValue = column.getSortValue!(b);

      // Handle null values
      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return 1;
      if (bValue === null) return -1;

      // Compare values
      let comparison = 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return sortDirection === 'desc' ? -comparison : comparison;
    });

    return sorted;
  }, [data, sortColumn, sortDirection, columns]).slice(0, 15);

  // Create columns with sortable headers
  const columnsWithSortableHeaders = useMemo(() => {
    return columns.map((column, index) => {
      const columnName =
        typeof column.name === 'string' ? column.name : String(column.name);
      const isSortable = !!column.getSortValue;
      const isSorted = sortColumn === columnName;
      const currentSortDirection = isSorted ? sortDirection : null;
      const isRightAligned = index !== 0;

      return {
        ...column,
        // Add a key property for React keys (using the original column name string)
        key: columnName,
        name: isSortable ? (
          <SortableHeader
            name={columnName}
            isSorted={isSorted}
            sortDirection={currentSortDirection}
            onClick={() => handleSort(columnName)}
            isRightAligned={isRightAligned}
          />
        ) : (
          column.name
        ),
        className: cn(
          index === 0
            ? 'text-left w-full font-medium min-w-0'
            : 'text-right font-mono',
          // Remove old responsive logic - now handled by responsive prop
          column.className,
        ),
      };
    });
  }, [columns, sortColumn, sortDirection]);

  return (
    <div className={cn(className)}>
      <WidgetTable
        data={sortedData}
        keyExtractor={keyExtractor}
        className={'text-sm min-h-[358px] @container'}
        columnClassName="[&_.cell:first-child]:pl-4 [&_.cell:last-child]:pr-4"
        eachRow={(item) => {
          return (
            <div className="absolute top-0 left-0 !p-0 w-full h-full">
              <div
                className="h-full bg-def-200 group-hover/row:bg-blue-200 dark:group-hover/row:bg-blue-900 transition-colors relative"
                style={{
                  width: `${getColumnPercentage(item) * 100}%`,
                }}
              />
            </div>
          );
        }}
        columns={columnsWithSortableHeaders}
      />
    </div>
  );
};

export function OverviewWidgetTableLoading({
  className,
}: {
  className?: string;
}) {
  return (
    <OverviewWidgetTable
      className={className}
      data={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
      keyExtractor={(item) => item.toString()}
      getColumnPercentage={() => 0}
      columns={[
        {
          name: 'Path',
          render: () => <Skeleton className="h-4 w-1/3" />,
          width: 'w-full',
        },
        {
          name: 'Sessions',
          render: () => <Skeleton className="h-4 w-[30px]" />,
          width: '84px',
        },
      ]}
    />
  );
}

function getPath(path: string, showDomain = false) {
  try {
    const url = new URL(path);
    if (showDomain) {
      return url.hostname + url.pathname;
    }
    return url.pathname;
  } catch {
    return path;
  }
}

export function OverviewWidgetTablePages({
  data,
  className,
  showDomain = false,
}: {
  className?: string;
  data: {
    origin: string;
    path: string;
    sessions: number;
    pageviews: number;
    revenue?: number;
  }[];
  showDomain?: boolean;
}) {
  const [_filters, setFilter] = useEventQueryFilters();
  const number = useNumber();
  const maxSessions = Math.max(...data.map((item) => item.sessions));
  const totalRevenue = data.reduce((sum, item) => sum + (item.revenue ?? 0), 0);
  const hasRevenue = data.some((item) => (item.revenue ?? 0) > 0);
  return (
    <OverviewWidgetTable
      className={className}
      data={data ?? []}
      keyExtractor={(item) => item.path + item.origin}
      getColumnPercentage={(item) => item.sessions / maxSessions}
      columns={[
        {
          name: 'Path',
          width: 'w-full',
          responsive: { priority: 1 }, // Always visible
          render(item) {
            return (
              <Tooltiper asChild content={item.origin + item.path} side="left">
                <div className="row items-center gap-2 min-w-0 relative">
                  <SerieIcon name={item.origin} />
                  <button
                    type="button"
                    className="truncate"
                    onClick={() => {
                      setFilter('path', item.path);
                      setFilter('origin', item.origin);
                    }}
                  >
                    {item.path ? (
                      <>
                        {showDomain ? (
                          <>
                            <span className="opacity-40">{item.origin}</span>
                            <span>{item.path}</span>
                          </>
                        ) : (
                          item.path
                        )}
                      </>
                    ) : (
                      <span className="opacity-40">Not set</span>
                    )}
                  </button>
                  <a
                    href={item.origin + item.path}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLinkIcon className="size-3 group-hover/row:opacity-100 opacity-0 transition-opacity" />
                  </a>
                </div>
              </Tooltiper>
            );
          },
        },
        ...(hasRevenue
          ? [
              {
                name: 'Revenue',
                width: '100px',
                responsive: { priority: 3 }, // Always show if possible
                getSortValue: (item: (typeof data)[number]) =>
                  item.revenue ?? 0,
                render(item: (typeof data)[number]) {
                  const revenue = item.revenue ?? 0;
                  const revenuePercentage =
                    totalRevenue > 0 ? revenue / totalRevenue : 0;
                  return (
                    <div className="row gap-2 items-center justify-end">
                      <span
                        className="font-semibold"
                        style={{ color: '#3ba974' }}
                      >
                        {revenue > 0 ? number.currency(revenue / 100) : '-'}
                      </span>
                      <RevenuePieChart percentage={revenuePercentage} />
                    </div>
                  );
                },
              } as const,
            ]
          : []),
        {
          name: 'Views',
          width: '84px',
          responsive: { priority: 2 }, // Always show if possible
          getSortValue: (item: (typeof data)[number]) => item.pageviews,
          render(item) {
            return (
              <div className="row gap-2 justify-end">
                <span className="font-semibold">
                  {number.short(item.pageviews)}
                </span>
              </div>
            );
          },
        },
        {
          name: 'Sess.',
          width: '84px',
          responsive: { priority: 2 }, // Always show if possible
          getSortValue: (item: (typeof data)[number]) => item.sessions,
          render(item) {
            return (
              <div className="row gap-2 justify-end">
                <span className="font-semibold">
                  {number.short(item.sessions)}
                </span>
              </div>
            );
          },
        },
      ]}
    />
  );
}

export function OverviewWidgetTableEntries({
  data,
  lastColumnName,
  className,
  showDomain = false,
}: {
  className?: string;
  lastColumnName: string;
  data: {
    origin: string;
    path: string;
    sessions: number;
    pageviews: number;
    revenue?: number;
  }[];
  showDomain?: boolean;
}) {
  const [_filters, setFilter] = useEventQueryFilters();
  const number = useNumber();
  const maxSessions = Math.max(...data.map((item) => item.sessions));
  const totalRevenue = data.reduce((sum, item) => sum + (item.revenue ?? 0), 0);
  const hasRevenue = data.some((item) => (item.revenue ?? 0) > 0);
  return (
    <OverviewWidgetTable
      className={className}
      data={data ?? []}
      keyExtractor={(item) => item.path + item.origin}
      getColumnPercentage={(item) => item.sessions / maxSessions}
      columns={[
        {
          name: 'Path',
          width: 'w-full',
          responsive: { priority: 1 }, // Always visible
          render(item) {
            return (
              <Tooltiper asChild content={item.origin + item.path} side="left">
                <div className="row items-center gap-2 min-w-0 relative">
                  <SerieIcon name={item.origin} />
                  <button
                    type="button"
                    className="truncate"
                    onClick={() => {
                      setFilter('path', item.path);
                      setFilter('origin', item.origin);
                    }}
                  >
                    {item.path ? (
                      <>
                        {showDomain ? (
                          <>
                            <span className="opacity-40">{item.origin}</span>
                            <span>{item.path}</span>
                          </>
                        ) : (
                          item.path
                        )}
                      </>
                    ) : (
                      <span className="opacity-40">Not set</span>
                    )}
                  </button>
                  <a
                    href={item.origin + item.path}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLinkIcon className="size-3 group-hover/row:opacity-100 opacity-0 transition-opacity" />
                  </a>
                </div>
              </Tooltiper>
            );
          },
        },
        ...(hasRevenue
          ? [
              {
                name: 'Revenue',
                width: '100px',
                responsive: { priority: 3 }, // Always show if possible
                getSortValue: (item: (typeof data)[number]) =>
                  item.revenue ?? 0,
                render(item: (typeof data)[number]) {
                  const revenue = item.revenue ?? 0;
                  const revenuePercentage =
                    totalRevenue > 0 ? revenue / totalRevenue : 0;
                  return (
                    <div className="row gap-2 items-center justify-end">
                      <span
                        className="font-semibold"
                        style={{ color: '#3ba974' }}
                      >
                        {revenue > 0 ? number.currency(revenue / 100) : '-'}
                      </span>
                      <RevenuePieChart percentage={revenuePercentage} />
                    </div>
                  );
                },
              } as const,
            ]
          : []),
        {
          name: lastColumnName,
          width: '84px',
          responsive: { priority: 2 }, // Always show if possible
          getSortValue: (item: (typeof data)[number]) => item.sessions,
          render(item) {
            return (
              <div className="row gap-2 justify-end">
                <span className="font-semibold">
                  {number.short(item.sessions)}
                </span>
              </div>
            );
          },
        },
      ]}
    />
  );
}

export function OverviewWidgetTableBots({
  data,
  className,
}: {
  className?: string;
  data: {
    total_sessions: number;
    origin: string;
    path: string;
    sessions: number;
    avg_duration: number;
    bounce_rate: number;
  }[];
}) {
  const [filters, setFilter] = useEventQueryFilters();
  const number = useNumber();
  const maxSessions = Math.max(...data.map((item) => item.sessions));
  return (
    <OverviewWidgetTable
      className={className}
      data={data ?? []}
      keyExtractor={(item) => item.path + item.origin}
      getColumnPercentage={(item) => item.sessions / maxSessions}
      columns={[
        {
          name: 'Path',
          width: 'w-full',
          render(item) {
            return (
              <Tooltiper asChild content={item.origin + item.path} side="left">
                <div className="row items-center gap-2 min-w-0 relative">
                  <SerieIcon name={item.origin} />
                  <button
                    type="button"
                    className="truncate"
                    onClick={() => {
                      setFilter('path', item.path);
                    }}
                  >
                    {getPath(item.path)}
                  </button>
                  <a
                    href={item.origin + item.path}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLinkIcon className="size-3 group-hover/row:opacity-100 opacity-0 transition-opacity" />
                  </a>
                </div>
              </Tooltiper>
            );
          },
        },
        {
          name: 'Bot',
          width: '60px',
          render(item) {
            return (
              <div className="row gap-2 justify-end">
                <span className="font-semibold">Google bot</span>
              </div>
            );
          },
        },
        {
          name: 'Date',
          width: '60px',
          render(item) {
            return (
              <div className="row gap-2 justify-end">
                <span className="font-semibold">Google bot</span>
              </div>
            );
          },
        },
      ]}
    />
  );
}

export function OverviewWidgetTableGeneric({
  data,
  column,
  className,
}: {
  className?: string;
  data: RouterOutputs['overview']['topGeneric'];
  column: {
    name: string;
    render: (
      item: RouterOutputs['overview']['topGeneric'][number],
    ) => React.ReactNode;
  };
}) {
  const number = useNumber();
  const maxSessions = Math.max(...data.map((item) => item.sessions));
  const totalRevenue = data.reduce((sum, item) => sum + (item.revenue ?? 0), 0);
  const hasRevenue = data.some((item) => (item.revenue ?? 0) > 0);
  const hasPageviews = data.some((item) => item.pageviews > 0);
  return (
    <OverviewWidgetTable
      className={className}
      data={data ?? []}
      keyExtractor={(item) => item.prefix + item.name}
      getColumnPercentage={(item) => item.sessions / maxSessions}
      columns={[
        {
          ...column,
          width: 'w-full',
          responsive: { priority: 1 }, // Always visible
        },
        ...(hasRevenue
          ? [
              {
                name: 'Revenue',
                width: '100px',
                responsive: { priority: 3 },
                getSortValue: (
                  item: RouterOutputs['overview']['topGeneric'][number],
                ) => item.revenue ?? 0,
                render(item: RouterOutputs['overview']['topGeneric'][number]) {
                  const revenue = item.revenue ?? 0;
                  const revenuePercentage =
                    totalRevenue > 0 ? revenue / totalRevenue : 0;
                  return (
                    <div className="row gap-2 items-center justify-end">
                      <span
                        className="font-semibold"
                        style={{ color: '#3ba974' }}
                      >
                        {revenue > 0
                          ? number.currency(revenue / 100, { short: true })
                          : '-'}
                      </span>
                      <RevenuePieChart percentage={revenuePercentage} />
                    </div>
                  );
                },
              } as const,
            ]
          : []),
        ...(hasPageviews
          ? [
              {
                name: 'Views',
                width: '84px',
                responsive: { priority: 2 },
                getSortValue: (
                  item: RouterOutputs['overview']['topGeneric'][number],
                ) => item.pageviews,
                render(item: RouterOutputs['overview']['topGeneric'][number]) {
                  return (
                    <div className="row gap-2 justify-end">
                      <span className="font-semibold">
                        {number.short(item.pageviews)}
                      </span>
                    </div>
                  );
                },
              } as const,
            ]
          : []),
        {
          name: 'Sess.',
          width: '84px',
          responsive: { priority: 2 },
          getSortValue: (
            item: RouterOutputs['overview']['topGeneric'][number],
          ) => item.sessions,
          render(item) {
            return (
              <div className="row gap-2 justify-end">
                <span className="font-semibold">
                  {number.short(item.sessions)}
                </span>
              </div>
            );
          },
        },
      ]}
    />
  );
}

export type EventTableItem = {
  id: string;
  name: string;
  count: number;
};

export function OverviewWidgetTableEvents({
  data,
  className,
  onItemClick,
}: {
  className?: string;
  data: EventTableItem[];
  onItemClick?: (name: string) => void;
}) {
  const number = useNumber();
  const maxCount = Math.max(...data.map((item) => item.count), 1);
  return (
    <OverviewWidgetTable
      className={className}
      data={data ?? []}
      keyExtractor={(item) => item.id}
      getColumnPercentage={(item) => item.count / maxCount}
      columns={[
        {
          name: 'Event',
          width: 'w-full',
          responsive: { priority: 1 },
          render(item) {
            return (
              <div className="row items-center gap-2 min-w-0 relative">
                <SerieIcon name={item.name} />
                <button
                  type="button"
                  className="truncate"
                  onClick={() => onItemClick?.(item.name)}
                >
                  {item.name || 'Not set'}
                </button>
              </div>
            );
          },
        },
        {
          name: 'Count',
          width: '84px',
          responsive: { priority: 2 },
          getSortValue: (item: EventTableItem) => item.count,
          render(item) {
            return (
              <div className="row gap-2 justify-end">
                <span className="font-semibold">
                  {number.short(item.count)}
                </span>
              </div>
            );
          },
        },
      ]}
    />
  );
}
