import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { useNumber } from '@/hooks/useNumerFormatter';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { ExternalLinkIcon } from 'lucide-react';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Skeleton } from '../skeleton';
import { Tooltiper } from '../ui/tooltip';
import { WidgetTable, type Props as WidgetTableProps } from '../widget-table';

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
              index !== 0 &&
                index !== columns.length - 1 &&
                'hidden @[310px]:table-cell',
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
  }[];
  showDomain?: boolean;
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
          render(item) {
            return number.shortWithUnit(item.bounce_rate, '%');
          },
        },
        {
          name: 'Duration',
          width: '75px',
          render(item) {
            return number.shortWithUnit(item.avg_duration, 'min');
          },
        },
        {
          name: lastColumnName,
          width: '84px',
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
        },
        {
          name: 'BR',
          width: '60px',
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
        {
          name: 'Sessions',
          width: '84px',
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
