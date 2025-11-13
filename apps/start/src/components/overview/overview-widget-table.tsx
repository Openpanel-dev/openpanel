import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useNumber } from '@/hooks/use-numer-formatter';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { ExternalLinkIcon } from 'lucide-react';
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
  return (
    <div className={cn(className)}>
      <WidgetTable
        data={data ?? []}
        keyExtractor={keyExtractor}
        className={'text-sm min-h-[358px] @container [&_.head]:pt-3'}
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
        columns={columns.map((column, index) => {
          return {
            ...column,
            className: cn(
              index === 0
                ? 'text-left w-full font-medium min-w-0'
                : 'text-right font-mono',
              // Remove old responsive logic - now handled by responsive prop
              column.className,
            ),
          };
        })}
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
          name: 'BR',
          render: () => <Skeleton className="h-4 w-[30px]" />,
          width: '60px',
        },
        // {
        //   name: 'Duration',
        //   render: () => <Skeleton className="h-4 w-[30px]" />,
        // },
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
  lastColumnName,
  className,
  showDomain = false,
}: {
  className?: string;
  lastColumnName: string;
  data: {
    origin: string;
    path: string;
    avg_duration: number;
    bounce_rate: number;
    sessions: number;
    revenue: number;
  }[];
  showDomain?: boolean;
}) {
  const [_filters, setFilter] = useEventQueryFilters();
  const number = useNumber();
  const maxSessions = Math.max(...data.map((item) => item.sessions));
  const totalRevenue = data.reduce((sum, item) => sum + item.revenue, 0);
  const hasRevenue = data.some((item) => item.revenue > 0);
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
        {
          name: 'BR',
          width: '60px',
          responsive: { priority: 6 }, // Hidden when space is tight
          render(item) {
            return number.shortWithUnit(item.bounce_rate, '%');
          },
        },
        {
          name: 'Duration',
          width: '75px',
          responsive: { priority: 7 }, // Hidden when space is tight
          render(item) {
            return number.shortWithUnit(item.avg_duration, 'min');
          },
        },
        ...(hasRevenue
          ? [
              {
                name: 'Revenue',
                width: '100px',
                responsive: { priority: 3 }, // Always show if possible
                render(item: (typeof data)[number]) {
                  const revenuePercentage =
                    totalRevenue > 0 ? item.revenue / totalRevenue : 0;
                  return (
                    <div className="row gap-2 items-center justify-end">
                      <span
                        className="font-semibold"
                        style={{ color: '#3ba974' }}
                      >
                        {item.revenue > 0
                          ? number.currency(item.revenue / 100)
                          : '-'}
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
  return (
    <OverviewWidgetTable
      className={className}
      data={data ?? []}
      keyExtractor={(item) => item.name}
      getColumnPercentage={(item) => item.sessions / maxSessions}
      columns={[
        {
          ...column,
          width: 'w-full',
          responsive: { priority: 1 }, // Always visible
        },
        {
          name: 'BR',
          width: '60px',
          responsive: { priority: 6 }, // Hidden when space is tight
          render(item) {
            return number.shortWithUnit(item.bounce_rate, '%');
          },
        },
        // {
        //   name: 'Duration',
        //   render(item) {
        //     return number.shortWithUnit(item.avg_session_duration, 'min');
        //   },
        // },

        ...(hasRevenue
          ? [
              {
                name: 'Revenue',
                width: '100px',
                responsive: { priority: 3 }, // Always show if possible
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
        {
          name: 'Sessions',
          width: '84px',
          responsive: { priority: 2 }, // Always show if possible
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
